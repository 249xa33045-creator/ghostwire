"""
Ghostwire Signaling Server
FastAPI + WebSockets on Render (free tier)

Responsibilities:
- Device registration (deviceId + publicKey)
- SDP relay via WebSocket (offer/answer/ice)
- Queue SDP for offline devices
- Trigger FCM push notifications
- NEVER stores messages or private keys
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
import os
from datetime import datetime, timedelta
import httpx

app = FastAPI(title="Ghostwire Signal Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── In-memory store (Render free tier — resets on sleep) ────────
# For production: swap with Supabase

active_connections: dict[str, WebSocket] = {}   # deviceId → ws
device_registry: dict[str, dict] = {}            # deviceId → { publicKeyJwk, pushToken }
pending_signals: dict[str, list] = {}            # deviceId → [signal, ...]

# ─── Models ──────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    deviceId: str
    publicKeyJwk: dict
    pushToken: Optional[str] = None

class SignalMessage(BaseModel):
    type: str        # offer | answer | ice
    from_id: str
    to: str
    payload: str

# ─── REST Endpoints ──────────────────────────────────────────────

@app.get("/")
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

# ─── WebSocket Signaling ─────────────────────────────────────────

@app.websocket("/signal")
async def signal_ws(ws: WebSocket, deviceId: str):
    await ws.accept()
    active_connections[deviceId] = ws

    # Flush any pending signals
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

            target_id = msg.get("to")
            if not target_id:
                continue

            # Relay to target if online
            target_ws = active_connections.get(target_id)
            if target_ws:
                try:
                    await target_ws.send_text(raw)
                except Exception:
                    # Target WS broken
                    active_connections.pop(target_id, None)
                    queue_signal(target_id, msg)
                    await send_push(target_id, msg.get("from_id", ""))
            else:
                # Queue + push notify
                queue_signal(target_id, msg)
                await send_push(target_id, msg.get("from_id", ""))

    except WebSocketDisconnect:
        active_connections.pop(deviceId, None)

# ─── Helpers ─────────────────────────────────────────────────────

def queue_signal(device_id: str, msg: dict):
    """Queue signal for offline device. Max 10 pending per device."""
    if device_id not in pending_signals:
        pending_signals[device_id] = []
    queue = pending_signals[device_id]
    queue.append(msg)
    # Keep only last 10
    if len(queue) > 10:
        pending_signals[device_id] = queue[-10:]

async def send_push(device_id: str, from_id: str):
    """Send FCM push to offline device."""
    device = device_registry.get(device_id)
    if not device or not device.get("pushToken"):
        return

    FCM_KEY = os.environ.get("FCM_SERVER_KEY")
    if not FCM_KEY:
        return

    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://fcm.googleapis.com/fcm/send",
                headers={
                    "Authorization": f"key={FCM_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "to": device["pushToken"],
                    "data": {
                        "type": "incoming_connection",
                        # No sender info — privacy
                    },
                    "notification": {
                        "title": "Ghostwire",
                        "body": "Incoming connection",
                        "sound": "default",
                    },
                    "priority": "high",
                },
                timeout=5,
            )
    except Exception as e:
        print(f"[Push] Failed: {e}")

# ─── Cleanup task (purge stale pending signals every 24h) ────────

@app.on_event("startup")
async def startup():
    asyncio.create_task(cleanup_loop())

async def cleanup_loop():
    while True:
        await asyncio.sleep(86400)  # 24h
        pending_signals.clear()
        print("[Cleanup] Cleared pending signals")
