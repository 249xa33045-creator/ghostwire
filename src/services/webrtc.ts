import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  RTCDataChannel,
} from 'react-native-webrtc'
import { compressSDP, decompressSDP } from './sdpCompress'
import { signalingService, SignalMessage } from './signaling'
import { debugLog } from './debugLog'
import { relayService } from './relay'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'relay'

export interface WebRTCCallbacks {
  onMessage: (content: string) => void
  onConnected: () => void
  onDisconnected: () => void
  onError: (err: string) => void
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

class WebRTCService {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private callbacks: WebRTCCallbacks | null = null
  private myDeviceId = ''
  private peerDeviceId = ''
  private iceFailTimer: ReturnType<typeof setTimeout> | null = null
  state: ConnectionState = 'idle'

  init(callbacks: WebRTCCallbacks) {
    this.callbacks = callbacks
  }

  private createPC(): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG)

    pc.onicecandidate = (e: any) => {
      if (e.candidate && this.peerDeviceId) {
        signalingService.send({
          type: 'ice',
          from_id: this.myDeviceId,
          to: this.peerDeviceId,
          payload: JSON.stringify(e.candidate),
        })
      }
    }

    pc.onconnectionstatechange = () => {
      const s = (pc as any).connectionState
      debugLog.log('[WebRTC] Connection state: ' + s)
      if (s === 'connected') {
        this.clearIceFailTimer()
        this.state = 'connected'
        this.callbacks?.onConnected()
      } else if (['disconnected', 'failed', 'closed'].includes(s)) {
        this.fallbackToRelay()
      }
    }

    pc.oniceconnectionstatechange = () => {
      const s = (pc as any).iceConnectionState
      debugLog.log('[WebRTC] ICE state: ' + s)
      if (s === 'failed') {
        this.fallbackToRelay()
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
      this.clearIceFailTimer()
      this.state = 'connected'
      this.callbacks?.onConnected()
    }
    dc.onclose = () => {
      this.fallbackToRelay()
    }
    dc.onmessage = (e: any) => {
      this.callbacks?.onMessage(e.data as string)
    }
  }

  private fallbackToRelay() {
    if (this.state === 'relay') return
    debugLog.log('[WebRTC] P2P failed, switching to relay mode')
    this.state = 'relay'
    this.dc?.close()
    this.pc?.close()
    this.dc = null
    this.pc = null
    // Still considered "connected" from user perspective
    this.callbacks?.onConnected()
  }

  private clearIceFailTimer() {
    if (this.iceFailTimer) {
      clearTimeout(this.iceFailTimer)
      this.iceFailTimer = null
    }
  }

  // ─── QR-based (offline LAN) flow ────────────────────────────

  async createOffer(): Promise<string> {
    this.state = 'connecting'
    this.pc = this.createPC()
    const dc = this.pc.createDataChannel('ghostwire', { ordered: true })
    this.setupDC(dc)
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer as RTCSessionDescription)
    await this.waitForICE()
    const fullDesc = this.pc.localDescription
    if (!fullDesc) throw new Error('No local description')
    return compressSDP(fullDesc)
  }

  async createAnswer(compressedOffer: string): Promise<string> {
    this.state = 'connecting'
    this.pc = this.createPC()
    const offerDesc = decompressSDP(compressedOffer)
    await this.pc.setRemoteDescription(new RTCSessionDescription(offerDesc))
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer as RTCSessionDescription)
    await this.waitForICE()
    const fullDesc = this.pc.localDescription
    if (!fullDesc) throw new Error('No local description')
    return compressSDP(fullDesc)
  }

  async receiveAnswer(compressedAnswer: string): Promise<void> {
    if (!this.pc) return
    const answerDesc = decompressSDP(compressedAnswer)
    await this.pc.setRemoteDescription(new RTCSessionDescription(answerDesc))
  }

  private waitForICE(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.pc) return resolve()
      const check = () => {
        if ((this.pc as any)?.iceGatheringState === 'complete') resolve()
      }
      ;(this.pc as any).onicegatheringstatechange = check
      setTimeout(resolve, 4000)
    })
  }

  // ─── Render-based (remote/internet) flow ────────────────────

  async connectViaServer(myDeviceId: string, peerDeviceId: string, isInitiator: boolean): Promise<void> {
    this.myDeviceId = myDeviceId
    this.peerDeviceId = peerDeviceId
    relayService.setDeviceId(myDeviceId)
    this.state = 'connecting'

    // ICE fail timer — fallback to relay after 15s if P2P doesn't connect
    this.iceFailTimer = setTimeout(() => {
      if (this.state === 'connecting') {
        debugLog.log('[WebRTC] ICE timeout, falling back to relay')
        this.fallbackToRelay()
      }
    }, 15000)

    signalingService.setHandler(async (msg: SignalMessage) => {
      debugLog.log('[WebRTC] Signal: ' + msg.type + ' from ' + msg.from_id)

      // Handle incoming relay messages
      if (msg.type === 'relay') {
        this.callbacks?.onMessage(msg.payload)
        return
      }

      if (msg.from_id !== peerDeviceId) return

      if (msg.type === 'offer' && !isInitiator) {
        this.pc = this.createPC()
        const offer = JSON.parse(msg.payload)
        await this.pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await this.pc.createAnswer()
        await this.pc.setLocalDescription(answer as RTCSessionDescription)
        signalingService.send({
          type: 'answer',
          from_id: myDeviceId,
          to: peerDeviceId,
          payload: JSON.stringify(answer),
        })
      } else if (msg.type === 'answer' && this.pc) {
        const answer = JSON.parse(msg.payload)
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer))
      } else if (msg.type === 'ice' && this.pc) {
        const candidate = JSON.parse(msg.payload)
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (e) {
          debugLog.log('[WebRTC] ICE candidate failed: ' + e)
        }
      }
    })

    await signalingService.connect(myDeviceId)

    if (isInitiator) {
      this.pc = this.createPC()
      const dc = this.pc.createDataChannel('ghostwire', { ordered: true })
      this.setupDC(dc)
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer as RTCSessionDescription)
      signalingService.send({
        type: 'offer',
        from_id: myDeviceId,
        to: peerDeviceId,
        payload: JSON.stringify(offer),
      })
    }
  }

  // ─── Send / Status ───────────────────────────────────────────

  async send(content: string): Promise<boolean> {
    // P2P path
    if (this.dc && (this.dc as any).readyState === 'open') {
      this.dc.send(content)
      return true
    }
    // Relay path — always try if peer is known, regardless of state
    if (this.peerDeviceId) {
      return await relayService.send(this.peerDeviceId, content)
    }
    return false
  }

  isConnected(): boolean {
    const dcOpen = this.dc != null && (this.dc as any).readyState === 'open'
    return dcOpen || this.state === 'connected' || this.state === 'relay'
  }

  isRelay(): boolean {
    return this.state === 'relay'
  }

  close() {
    this.clearIceFailTimer()
    this.state = 'idle'
    this.dc?.close()
    this.pc?.close()
    this.dc = null
    this.pc = null
    signalingService.disconnect()
  }
}

export const webrtcService = new WebRTCService()
