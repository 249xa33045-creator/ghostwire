const SERVER_URL = 'https://ghostwire-yn6a.onrender.com'
const WS_URL = 'wss://ghostwire-yn6a.onrender.com/signal'

export interface SignalMessage {
  type: 'offer' | 'answer' | 'ice' | 'ping' | 'pong'
  from_id: string
  to: string
  payload: string
}

export type SignalHandler = (msg: SignalMessage) => void
export type StatusHandler = (status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting') => void

class SignalingService {
  private ws: WebSocket | null = null
  private handler: SignalHandler | null = null
  private statusHandler: StatusHandler | null = null
  private myDeviceId: string = ''
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = true
  private reconnectAttempts = 0
  connected = false

  setHandler(handler: SignalHandler) {
    this.handler = handler
  }

  setStatusHandler(handler: StatusHandler) {
    this.statusHandler = handler
  }

  connect(deviceId: string): Promise<void> {
    this.myDeviceId = deviceId
    this.shouldReconnect = true
    this.reconnectAttempts = 0
    return this._connectInternal()
  }

  private _connectInternal(): Promise<void> {
    this.statusHandler?.('connecting')
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(`${WS_URL}?deviceId=${this.myDeviceId}`)

        ws.onopen = () => {
          this.ws = ws
          this.connected = true
          this.reconnectAttempts = 0
          this.startKeepalive()
          this.statusHandler?.('connected')
          resolve()
        }

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string) as SignalMessage
            if (msg.type === 'pong') return
            this.handler?.(msg)
          } catch {}
        }

        ws.onclose = () => {
          this.connected = false
          this.ws = null
          this.stopKeepalive()
          if (this.shouldReconnect) {
            this.statusHandler?.('reconnecting')
            this.scheduleReconnect()
          } else {
            this.statusHandler?.('disconnected')
          }
        }

        ws.onerror = () => {
          this.connected = false
          if (this.reconnectAttempts === 0) {
            reject(new Error('WebSocket connection failed'))
          }
        }

        setTimeout(() => {
          if (!this.connected && this.reconnectAttempts === 0) {
            reject(new Error('Connection timeout'))
          }
        }, 15000)
      } catch (e) {
        reject(e)
      }
    })
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectAttempts++
    // Exponential backoff, max 10s
    const delay = Math.min(1000 * this.reconnectAttempts, 10000)
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect) {
        this._connectInternal().catch(() => {})
      }
    }, delay)
  }

  private startKeepalive() {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', from_id: this.myDeviceId, to: '', payload: '' }))
      }
    }, 20000)
  }

  private stopKeepalive() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  send(msg: SignalMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    try {
      this.ws.send(JSON.stringify(msg))
      return true
    } catch {
      return false
    }
  }

  disconnect() {
    this.shouldReconnect = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.stopKeepalive()
    this.ws?.close()
    this.ws = null
    this.connected = false
  }
}

export const signalingService = new SignalingService()

export async function registerOnServer(deviceId: string, sharedKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, publicKeyJwk: { key: sharedKey } }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchContactKey(deviceId: string): Promise<string | null> {
  try {
    const res = await fetch(`${SERVER_URL}/key/${deviceId}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.publicKeyJwk?.key ?? null
  } catch {
    return null
  }
}
