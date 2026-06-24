/**
 * Ghostwire Relay Service
 * Sends encrypted messages via Render server when WebRTC P2P is unavailable
 */

const RELAY_URL = 'https://ghostwire-yn6a.onrender.com/relay'

class RelayService {
  private myDeviceId = ''

  setDeviceId(id: string) {
    this.myDeviceId = id
  }

  async send(toDeviceId: string, encryptedPayload: string): Promise<boolean> {
    try {
      const res = await fetch(RELAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toDeviceId,
          from_id: this.myDeviceId,
          payload: encryptedPayload,
          timestamp: new Date().toISOString(),
        }),
      })
      const data = await res.json()
      return data.ok === true
    } catch (e) {
      console.error('[Relay] Send failed:', e)
      return false
    }
  }
}

export const relayService = new RelayService()
