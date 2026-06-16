/**
 * Ghostwire Signaling Service
 * Priority 1: WiFi Direct / LAN UDP broadcast (offline)
 * Priority 2: Render WebSocket (internet fallback)
 * 
 * Handles SDP offer/answer relay only.
 * Never relays message content.
 */

import { getProfile, getContact } from './identity'

// ─── Config ───────────────────────────────────────────────────────

const RENDER_WS_URL = 'wss://ghostwire-server.onrender.com/signal'
const LAN_DISCOVERY_PORT = 47821
const LAN_HTTP_PORT = 47822

export type SignalingMode = 'lan' | 'remote' | 'none'

export interface SignalMessage {
  type: 'offer' | 'answer' | 'ice' | 'key' | 'ping' | 'pong'
  from: string       // deviceId
  to: string         // deviceId
  payload: string    // JSON stringified
}

export type SignalHandler = (msg: SignalMessage) => void

// ─── Service ──────────────────────────────────────────────────────

class SignalingService {
  private ws: WebSocket | null = null
  private handler: SignalHandler | null = null
  private myDeviceId: string = ''
  mode: SignalingMode = 'none'
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  setHandler(handler: SignalHandler) {
    this.handler = handler
  }

  // ─── LAN Mode ───────────────────────────────────────────────

  /**
   * In React Native, true UDP broadcast needs a native module.
   * We use a simple HTTP polling approach on LAN as fallback.
   * For WiFi Direct: handled by native WiFiDirect module (separate).
   * 
   * LAN signaling: both devices connect to same local HTTP endpoint.
   * Host device runs a tiny HTTP server on port 47822.
   * Joiner scans and sends SDP to host's local IP.
   */
  async sendLAN(targetLocalIP: string, msg: SignalMessage): Promise<boolean> {
    try {
      const res = await fetch(`http://${targetLocalIP}:${LAN_HTTP_PORT}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
        // Short timeout for LAN
        signal: AbortSignal.timeout(3000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  // ─── Remote Mode (Render WebSocket) ──────────────────────────

  async connectRemote(deviceId: string): Promise<void> {
    this.myDeviceId = deviceId
    this.mode = 'remote'

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${RENDER_WS_URL}?deviceId=${deviceId}`)

      ws.onopen = () => {
        this.ws = ws
        console.log('[Signal] Remote WS connected')
        resolve()
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as SignalMessage
          this.handler?.(msg)
        } catch {
          console.error('[Signal] Bad message')
        }
      }

      ws.onclose = () => {
        console.log('[Signal] WS closed, reconnecting...')
        this.ws = null
        this.scheduleReconnect()
      }

      ws.onerror = (e) => {
        console.error('[Signal] WS error', e)
        reject(new Error('WebSocket connection failed'))
      }

      setTimeout(() => reject(new Error('Connection timeout')), 10000)
    })
  }

  async sendRemote(msg: SignalMessage): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    try {
      this.ws.send(JSON.stringify(msg))
      return true
    } catch {
      return false
    }
  }

  // ─── Unified Send ─────────────────────────────────────────────

  async send(msg: SignalMessage, targetLocalIP?: string): Promise<boolean> {
    if (this.mode === 'lan' && targetLocalIP) {
      return this.sendLAN(targetLocalIP, msg)
    }
    if (this.mode === 'remote') {
      return this.sendRemote(msg)
    }
    return false
  }

  // ─── Reconnect ────────────────────────────────────────────────

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(async () => {
      if (this.myDeviceId) {
        try {
          await this.connectRemote(this.myDeviceId)
        } catch {
          this.scheduleReconnect()
        }
      }
    }, 5000)
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
    this.mode = 'none'
  }
}

export const signalingService = new SignalingService()

// ─── Render Registration ─────────────────────────────────────────

export async function registerOnServer(
  deviceId: string,
  publicKeyJwk: JsonWebKey,
  pushToken?: string
): Promise<boolean> {
  try {
    const res = await fetch('https://ghostwire-server.onrender.com/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, publicKeyJwk, pushToken }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchContactKey(deviceId: string): Promise<JsonWebKey | null> {
  try {
    const res = await fetch(`https://ghostwire-server.onrender.com/key/${deviceId}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.publicKeyJwk as JsonWebKey
  } catch {
    return null
  }
}
