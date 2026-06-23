"""
Ghostwire Signaling + Relay Server
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
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

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

class RelayMessage(BaseModel):
    to: str
    from_id: str
    payload: str
    timestamp: str

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

@app.post("/relay")
async def relay_message(msg: RelayMessage):
    data = {
        "type": "relay",
        "from_id": msg.from_id,
        "to": msg.to,
        "payload": msg.payload,
        "timestamp": msg.timestamp,
    }
    # Try live delivery first
    target_ws = active_connections.get(msg.to)
    if target_ws:
        try:
            await target_ws.send_text(json.dumps(data))
            return {"ok": True, "delivered": True}
        except Exception:
            active_connections.pop(msg.to, None)

    # Recipient offline - persist to Supabase
    if supabase:
        try:
            supabase.table("pending_messages").insert({
                "to_device": msg.to,
                "from_device": msg.from_id,
                "payload": msg.payload,
                "timestamp": msg.timestamp,
                "created_at": datetime.utcnow().isoformat(),
            }).execute()
        except Exception as e:
            print(f"Supabase insert failed: {e}")
    else:
        queue_signal(msg.to, data)

    return {"ok": True, "delivered": False, "queued": True}

@app.websocket("/signal")
async def signal_ws(ws: WebSocket, deviceId: str):
    await ws.accept()
    active_connections[deviceId] = ws

    # Flush in-memory queue
    if deviceId in pending_signals:
        for m in pending_signals.pop(deviceId):
            try:
                await ws.send_text(json.dumps(m))
            except Exception:
                pass

    # Flush Supabase queue
    if supabase:
        try:
            rows = supabase.table("pending_messages")\
                .select("*")\
                .eq("to_device", deviceId)\
                .execute()
            if rows.data:
                for row in rows.data:
                    try:
                        await ws.send_text(json.dumps({
                            "type": "relay",
                            "from_id": row["from_device"],
                            "to": deviceId,
                            "payload": row["payload"],
                            "timestamp": row["timestamp"],
                        }))
                    except Exception:
                        pass
                # Delete delivered messages
                supabase.table("pending_messages")\
                    .delete()\
                    .eq("to_device", deviceId)\
                    .execute()
        except Exception as e:
            print(f"Supabase flush failed: {e}")

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
    if len(queue) > 50:
        pending_signals[device_id] = queue[-50:]

@app.on_event("startup")
async def startup():
    asyncio.create_task(cleanup_loop())

async def cleanup_loop():
    while True:
        await asyncio.sleep(86400)
        pending_signals.clear()
