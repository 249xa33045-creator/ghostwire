/**
 * Ghostwire WebRTC Service
 * P2P DataChannel for message transport
 * Encrypted payload only — server/network sees ciphertext
 */

import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  RTCDataChannel,
  MediaStream,
} from 'react-native-webrtc'
import { encryptMessage, decryptMessage } from './crypto'

// ─── Types ────────────────────────────────────────────────────────

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected'

export interface WebRTCCallbacks {
  onMessage: (content: string) => void
  onConnected: () => void
  onDisconnected: () => void
  onError: (err: string) => void
  onIceCandidate: (candidate: RTCIceCandidateInit) => void
}

// ─── Config ───────────────────────────────────────────────────────

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    // Try local first (offline), fall back to STUN for remote
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceTransportPolicy: 'all',
}

// ─── Service ──────────────────────────────────────────────────────

class WebRTCService {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private sharedSecret: CryptoKey | null = null
  private callbacks: WebRTCCallbacks | null = null
  private iceQueue: RTCIceCandidateInit[] = []
  state: ConnectionState = 'idle'

  init(callbacks: WebRTCCallbacks) {
    this.callbacks = callbacks
  }

  setSharedSecret(key: CryptoKey) {
    this.sharedSecret = key
  }

  // ─── Peer Connection ──────────────────────────────────────────

  private createPC(): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG)

    pc.onicecandidate = (e: any) => {
      if (e.candidate) {
        this.callbacks?.onIceCandidate(e.candidate.toJSON())
      }
    }

    pc.onconnectionstatechange = () => {
      const s = (pc as any).connectionState
      if (s === 'connected') {
        this.state = 'connected'
        this.callbacks?.onConnected()
      } else if (['disconnected', 'failed', 'closed'].includes(s)) {
        this.state = 'disconnected'
        this.callbacks?.onDisconnected()
      }
    }

    pc.ondatachannel = (e: any) => {
      this.dc = e.channel
      this.setupDC(this.dc!)
    }

    return pc
  }

  private setupDC(dc: RTCDataChannel) {
    (dc as any).binaryType = 'arraybuffer'

    dc.onopen = () => {
      this.state = 'connected'
      this.callbacks?.onConnected()
    }

    dc.onclose = () => {
      this.state = 'disconnected'
      this.callbacks?.onDisconnected()
    }

    dc.onmessage = async (e: any) => {
      if (!this.sharedSecret) return
      try {
        const decrypted = await decryptMessage(this.sharedSecret, e.data as string)
        this.callbacks?.onMessage(decrypted)
      } catch {
        this.callbacks?.onError('Failed to decrypt message')
      }
    }
  }

  // ─── Offer / Answer ───────────────────────────────────────────

  async createOffer(): Promise<string> {
    this.state = 'connecting'
    this.pc = this.createPC()

    this.dc = this.pc.createDataChannel('ghostwire', { ordered: true }) as RTCDataChannel
    this.setupDC(this.dc)

    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer as RTCSessionDescription)

    // Wait for ICE gathering
    await this.waitForICE()

    return JSON.stringify(this.pc.localDescription)
  }

  async createAnswer(offerStr: string): Promise<string> {
    this.state = 'connecting'
    this.pc = this.createPC()

    const offer = new RTCSessionDescription(JSON.parse(offerStr))
    await this.pc.setRemoteDescription(offer)

    // Flush ICE queue
    for (const c of this.iceQueue) {
      await this.pc.addIceCandidate(new RTCIceCandidate(c))
    }
    this.iceQueue = []

    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer as RTCSessionDescription)

    await this.waitForICE()

    return JSON.stringify(this.pc.localDescription)
  }

  async setAnswer(answerStr: string) {
    if (!this.pc) return
    const answer = new RTCSessionDescription(JSON.parse(answerStr))
    await this.pc.setRemoteDescription(answer)

    for (const c of this.iceQueue) {
      await this.pc.addIceCandidate(new RTCIceCandidate(c))
    }
    this.iceQueue = []
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.pc) return
    if (this.pc.remoteDescription) {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
    } else {
      this.iceQueue.push(candidate)
    }
  }

  // ─── Send ─────────────────────────────────────────────────────

  async sendMessage(content: string): Promise<boolean> {
    if (!this.dc || (this.dc as any).readyState !== 'open' || !this.sharedSecret) {
      return false
    }
    try {
      const encrypted = await encryptMessage(this.sharedSecret, content)
      this.dc.send(encrypted)
      return true
    } catch {
      return false
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private waitForICE(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.pc) return resolve()
      const check = () => {
        if ((this.pc as any)?.iceGatheringState === 'complete') {
          resolve()
        }
      }
      ;(this.pc as any).onicegatheringstatechange = check
      // Fallback timeout
      setTimeout(resolve, 3000)
    })
  }

  isConnected(): boolean {
    return this.state === 'connected'
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  close() {
    this.state = 'idle'
    this.sharedSecret = null
    this.iceQueue = []
    this.dc?.close()
    this.pc?.close()
    this.dc = null
    this.pc = null
  }
}

export const webrtcService = new WebRTCService()
