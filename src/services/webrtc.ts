import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  RTCDataChannel,
} from 'react-native-webrtc'
import { compressSDP, decompressSDP } from './sdpCompress'
import { signalingService, SignalMessage } from './signaling'
import { debugLog } from './debugLog'

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
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:turn.speed.cloudflare.com:50000',
      username: 'webrtc',
      credential: 'webrtc',
    },
    {
      urls: 'turns:turn.speed.cloudflare.com:443?transport=tcp',
      username: 'webrtc',
      credential: 'webrtc',
    },
  ],
}

class WebRTCService {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private callbacks: WebRTCCallbacks | null = null
  private myDeviceId = ''
  private peerDeviceId = ''
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
      debugLog.log('[WebRTC] Connection state changed: ' + s)
      if (s === 'connected') {
        this.state = 'connected'
        this.callbacks?.onConnected()
      } else if (['disconnected', 'failed', 'closed'].includes(s)) {
        this.state = 'disconnected'
        this.callbacks?.onDisconnected()
      }
    }

    pc.oniceconnectionstatechange = () => {
      debugLog.log('[WebRTC] ICE connection state: ' + (pc as any).iceConnectionState)
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
    this.state = 'connecting'

    signalingService.setHandler(async (msg: SignalMessage) => {
      debugLog.log('[WebRTC] Received signal: ' + msg.type + ' from ' + msg.from_id)
      if (msg.from_id !== peerDeviceId) {
        debugLog.log('[WebRTC] Ignoring signal from unknown peer')
        return
      }

      if (msg.type === 'offer' && !isInitiator) {
        debugLog.log('[WebRTC] Processing offer, creating answer')
        this.pc = this.createPC()
        const offer = JSON.parse(msg.payload)
        await this.pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await this.pc.createAnswer()
        await this.pc.setLocalDescription(answer as RTCSessionDescription)
        debugLog.log('[WebRTC] Sending answer')
        signalingService.send({
          type: 'answer',
          from_id: myDeviceId,
          to: peerDeviceId,
          payload: JSON.stringify(answer),
        })
      } else if (msg.type === 'answer' && this.pc) {
        debugLog.log('[WebRTC] Processing answer')
        const answer = JSON.parse(msg.payload)
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer))
        debugLog.log('[WebRTC] Remote description set from answer')
      } else if (msg.type === 'ice' && this.pc) {
        debugLog.log('[WebRTC] Adding ICE candidate')
        const candidate = JSON.parse(msg.payload)
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
          debugLog.log('[WebRTC] ICE candidate added successfully')
        } catch (e) {
          debugLog.log('[WebRTC] ICE candidate failed:', e)
        }
      } else {
        debugLog.log('[WebRTC] Unhandled signal, pc exists: ' + !!this.pc + ' isInitiator: ' + isInitiator)
      }
    })

    debugLog.log('[WebRTC] Connecting to signaling server as ' + myDeviceId)
    await signalingService.connect(myDeviceId)
    debugLog.log('[WebRTC] Signaling connected, isInitiator: ' + isInitiator)

    if (isInitiator) {
      this.pc = this.createPC()
      const dc = this.pc.createDataChannel('ghostwire', { ordered: true })
      this.setupDC(dc)
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer as RTCSessionDescription)
      debugLog.log('[WebRTC] Sending offer to ' + peerDeviceId)
      const sent = signalingService.send({
        type: 'offer',
        from_id: myDeviceId,
        to: peerDeviceId,
        payload: JSON.stringify(offer),
      })
      debugLog.log('[WebRTC] Offer send result: ' + sent)
    }
  }

  // ─── Send / Status ───────────────────────────────────────────

  send(content: string): boolean {
    if (!this.dc || (this.dc as any).readyState !== 'open') return false
    this.dc.send(content)
    return true
  }

  isConnected(): boolean {
    // Check the real DataChannel state, not just our manually-tracked flag
    const dcOpen = this.dc != null && (this.dc as any).readyState === 'open'
    return dcOpen || this.state === 'connected'
  }

  close() {
    this.state = 'idle'
    this.dc?.close()
    this.pc?.close()
    this.dc = null
    this.pc = null
    signalingService.disconnect()
  }
}

export const webrtcService = new WebRTCService()
