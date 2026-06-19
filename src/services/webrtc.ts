import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  RTCDataChannel,
} from 'react-native-webrtc'
import { compressSDP, decompressSDP } from './sdpCompress'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected'

export interface WebRTCCallbacks {
  onMessage: (content: string) => void
  onConnected: () => void
  onDisconnected: () => void
  onError: (err: string) => void
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
}

class WebRTCService {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private callbacks: WebRTCCallbacks | null = null
  state: ConnectionState = 'idle'

  init(callbacks: WebRTCCallbacks) {
    this.callbacks = callbacks
  }

  private createPC(): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG)

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
      this.setupDC(e.channel)
    }

    return pc
  }

  private setupDC(dc: any) {
    this.dc = dc
    dc.onopen = () => {
      this.state = 'connected'
      this.callbacks?.onConnected()
    }
    dc.onclose = () => {
      this.state = 'disconnected'
      this.callbacks?.onDisconnected()
    }
    dc.onmessage = (e: any) => {
      this.callbacks?.onMessage(e.data as string)
    }
  }

  // HOST: create offer, returns compressed SDP string for QR
  async createOffer(): Promise<string> {
    this.state = 'connecting'
    this.pc = this.createPC()

    const dc = this.pc.createDataChannel('ghostwire', { ordered: true })
    this.setupDC(dc)

    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer as RTCSessionDescription)

    // Wait for ICE gathering (need candidates baked into SDP)
    await new Promise<void>((resolve) => {
      const check = () => {
        if ((this.pc as any)?.iceGatheringState === 'complete') resolve()
      }
      ;(this.pc as any).onicegatheringstatechange = check
      setTimeout(resolve, 4000)
    })

    const fullDesc = this.pc.localDescription
    if (!fullDesc) throw new Error('No local description')
    
    return compressSDP(fullDesc)
  }

  // GUEST: receives offer QR, creates answer for QR
  async createAnswer(compressedOffer: string): Promise<string> {
    this.state = 'connecting'
    this.pc = this.createPC()

    const offerDesc = decompressSDP(compressedOffer)
    const offer = new RTCSessionDescription(offerDesc)
    await this.pc.setRemoteDescription(offer)

    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer as RTCSessionDescription)

    await new Promise<void>((resolve) => {
      const check = () => {
        if ((this.pc as any)?.iceGatheringState === 'complete') resolve()
      }
      ;(this.pc as any).onicegatheringstatechange = check
      setTimeout(resolve, 4000)
    })

    const fullDesc = this.pc.localDescription
    if (!fullDesc) throw new Error('No local description')

    return compressSDP(fullDesc)
  }

  // HOST: receives answer QR, completes connection
  async receiveAnswer(compressedAnswer: string): Promise<void> {
    if (!this.pc) return
    const answerDesc = decompressSDP(compressedAnswer)
    const answer = new RTCSessionDescription(answerDesc)
    await this.pc.setRemoteDescription(answer)
  }

  send(content: string): boolean {
    if (!this.dc || (this.dc as any).readyState !== 'open') return false
    this.dc.send(content)
    return true
  }

  isConnected(): boolean {
    return this.state === 'connected'
  }

  close() {
    this.state = 'idle'
    this.dc?.close()
    this.pc?.close()
    this.dc = null
    this.pc = null
  }
}

export const webrtcService = new WebRTCService()
