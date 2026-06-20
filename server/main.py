"""
Ghostwire Signaling Server
FastAPI + WebSockets on Render (free tier)
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
import os
from datetime import datetime

app = FastAPI(title="Ghostwire Signal Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

active_connections: dict[str, WebSocket] = {}
device_registry: dict[str, dict] = {}
pending_signals: dict[str, list] = {}

class RegisterRequest(BaseModel):
    deviceId: str
    publicKeyJwk: dict
    pushToken: Optional[str] = None

@app.api_route("/", methods=["GET", "HEAD"])
def health():
    return {
        "status": "ok",
        "service": "ghostwire-signal",
        "connected": len(active_connections),
        "registered": len(device_registry),
    }

@app.post("/register")
async def register(req: RegisterRequest):
    device_registry[req.deviceId] = {
        "publicKeyJwk": req.publicKeyJwk,
        "pushToken": req.pushToken,
        "registeredAt": datetime.utcnow().isoformat(),
    }
    return {"ok": True, "deviceId": req.deviceId}

@app.get("/key/{device_id}")
async def get_key(device_id: str):
    device = device_registry.get(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"publicKeyJwk": device["publicKeyJwk"]}

@app.delete("/unregister/{device_id}")
async def unregister(device_id: str):
    device_registry.pop(device_id, None)
    pending_signals.pop(device_id, None)
    return {"ok": True}

@app.websocket("/signal")
async def signal_ws(ws: WebSocket, deviceId: str):
    await ws.accept()
    active_connections[deviceId] = ws

    if deviceId in pending_signals:
        for msg in pending_signals.pop(deviceId):
            try:
                await ws.send_text(json.dumps(msg))
            except Exception:
                pass

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            if msg.get("type") == "ping":
                try:
                    await ws.send_text(json.dumps({
                        "type": "pong", "from_id": "server", "to": deviceId, "payload": ""
                    }))
                except Exception:
                    pass
                continue

            target_id = msg.get("to")
            if not target_id:
                continue

            target_ws = active_connections.get(target_id)
            if target_ws:
                try:
                    await target_ws.send_text(raw)
                except Exception:
                    active_connections.pop(target_id, None)
                    queue_signal(target_id, msg)
            else:
                queue_signal(target_id, msg)

    except WebSocketDisconnect:
        active_connections.pop(deviceId, None)

def queue_signal(device_id: str, msg: dict):
    if device_id not in pending_signals:
        pending_signals[device_id] = []
    queue = pending_signals[device_id]
    queue.append(msg)
    if len(queue) > 10:
        pending_signals[device_id] = queue[-10:]

@app.on_event("startup")
async def startup():
    asyncio.create_task(cleanup_loop())

async def cleanup_loop():
    while True:
        await asyncio.sleep(86400)
        pending_signals.clear()
