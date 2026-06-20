import React, { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { colors, spacing, text, radius } from '../utils/tokens'
import { webrtcService } from '../services/webrtc'
import { Contact, getProfile } from '../services/identity'

type Step =
  | 'choose'
  | 'host_generating' | 'host_show_qr' | 'host_scanning'
  | 'guest_scanning' | 'guest_show_qr'
  | 'remote_connecting'
  | 'connecting' | 'connected'

interface Props {
  contact: Contact
  onConnected: () => void
  onCancel: () => void
}

export default function ConnectScreen({ contact, onConnected, onCancel }: Props) {
  const [step, setStep] = useState<Step>('choose')
  const [offerSDP, setOfferSDP] = useState('')
  const [answerSDP, setAnswerSDP] = useState('')
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const [connectMsg, setConnectMsg] = useState('Connecting via internet...')

  useEffect(() => {
    webrtcService.init({
      onMessage: () => {},
      onConnected: () => {
        setStep('connected')
        setTimeout(onConnected, 500)
      },
      onDisconnected: () => {},
      onError: (e) => Alert.alert('Error', e),
    })
    return () => {}
  }, [])

  // ── SAME WIFI (QR) ──────────────────────────────────────

  async function startAsHost() {
    setStep('host_generating')
    try {
      const sdp = await webrtcService.createOffer()
      setOfferSDP(sdp)
      setStep('host_show_qr')
    } catch (e: any) {
      Alert.alert('Error', 'Failed to create offer: ' + e.message)
      setStep('choose')
    }
  }

  function hostReadyToScan() {
    if (!permission?.granted) {
      requestPermission().then(() => setStep('host_scanning'))
    } else {
      setScanned(false)
      setStep('host_scanning')
    }
  }

  async function handleHostScanAnswer({ data }: { data: string }) {
    if (scanned) return
    setScanned(true)
    setStep('connecting')
    try {
      await webrtcService.receiveAnswer(data)
    } catch (e: any) {
      Alert.alert('Error', 'Invalid answer QR: ' + e.message)
      setStep('host_scanning')
      setScanned(false)
    }
  }

  function startAsGuest() {
    if (!permission?.granted) {
      requestPermission().then(() => {
        setScanned(false)
        setStep('guest_scanning')
      })
    } else {
      setScanned(false)
      setStep('guest_scanning')
    }
  }

  async function handleGuestScanOffer({ data }: { data: string }) {
    if (scanned) return
    setScanned(true)
    setStep('connecting')
    try {
      const sdp = await webrtcService.createAnswer(data)
      setAnswerSDP(sdp)
      setStep('guest_show_qr')
    } catch (e: any) {
      Alert.alert('Error', 'Invalid offer QR: ' + e.message)
      setStep('guest_scanning')
      setScanned(false)
    }
  }

  // ── INTERNET (Render) ───────────────────────────────────

  async function connectViaInternet() {
    setStep('remote_connecting')
    setConnectMsg('Waking up server...')
    try {
      const profile = await getProfile()
      if (!profile) throw new Error('No profile')

      // Wake server first (handles free-tier cold start, can take up to 60s)
      const wakeStart = Date.now()
      try {
        await fetch('https://ghostwire-yn6a.onrender.com/', { method: 'GET' })
      } catch {}
      const wakeDuration = Date.now() - wakeStart
      if (wakeDuration > 3000) {
        setConnectMsg('Server was asleep, waking up...')
        await new Promise(r => setTimeout(r, 1000))
      }

      setConnectMsg('Connecting to ' + contact.name + '...')
      const isInitiator = profile.deviceId < contact.deviceId
      await webrtcService.connectViaServer(profile.deviceId, contact.deviceId, isInitiator)
      setConnectMsg('Establishing encrypted channel...')
      setStep('connecting')
    } catch (e: any) {
      Alert.alert('Connection failed', e.message || 'Could not connect via internet. Make sure ' + contact.name + ' has the app open too.')
      setStep('choose')
    }
  }

  // ── RENDER ────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.back}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Connect to {contact.name}</Text>
        <View style={{ width: 32 }} />
      </View>

      {step === 'choose' && (
        <View style={styles.center}>
          <Text style={styles.instruction}>How do you want to connect?</Text>

          <TouchableOpacity style={styles.btn} onPress={connectViaInternet}>
            <Text style={styles.btnText}>Connect via Internet</Text>
            <Text style={styles.btnSub}>Works anywhere, uses Render server</Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <Text style={styles.dividerText}>or, same WiFi only</Text>
          </View>

          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={startAsHost}>
            <Text style={styles.btnText}>I am the Host</Text>
            <Text style={styles.btnSub}>QR code, same WiFi/hotspot</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={startAsGuest}>
            <Text style={styles.btnText}>I am the Guest</Text>
            <Text style={styles.btnSub}>QR code, same WiFi/hotspot</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'remote_connecting' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.purple} size="large" />
          <Text style={styles.instruction}>{connectMsg}</Text>
          <Text style={styles.hintSmall}>First connection of the session can take up to a minute.{'\n'}Make sure {contact.name} has the app open too.</Text>
        </View>
      )}

      {step === 'host_generating' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.purple} size="large" />
          <Text style={styles.instruction}>Generating secure connection...</Text>
        </View>
      )}

      {step === 'host_show_qr' && (
        <ScrollView contentContainerStyle={styles.center}>
          <Text style={styles.instruction}>Show this QR to {contact.name}.{'\n'}They will scan it on their device.</Text>
          <View style={styles.qrWrap}>
            <QRCode value={offerSDP} size={220} backgroundColor="#f0f0f0" color="#0a0a0a" />
          </View>
          <TouchableOpacity style={styles.btn} onPress={hostReadyToScan}>
            <Text style={styles.btnText}>They scanned it → Scan their QR</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {step === 'host_scanning' && (
        <View style={styles.container}>
          <Text style={styles.scanLabel}>Scan {contact.name}'s answer QR</Text>
          <CameraView style={styles.camera} facing="back" onBarcodeScanned={handleHostScanAnswer} barcodeScannerSettings={{ barcodeTypes: ['qr'] }}>
            <View style={styles.scanOverlay}>
              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
            </View>
          </CameraView>
        </View>
      )}

      {step === 'guest_scanning' && (
        <View style={styles.container}>
          <Text style={styles.scanLabel}>Scan {contact.name}'s offer QR</Text>
          <CameraView style={styles.camera} facing="back" onBarcodeScanned={handleGuestScanOffer} barcodeScannerSettings={{ barcodeTypes: ['qr'] }}>
            <View style={styles.scanOverlay}>
              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
            </View>
          </CameraView>
        </View>
      )}

      {step === 'guest_show_qr' && (
        <ScrollView contentContainerStyle={styles.center}>
          <Text style={styles.instruction}>Show this QR to {contact.name}.{'\n'}They will scan it to complete the connection.</Text>
          <View style={styles.qrWrap}>
            <QRCode value={answerSDP} size={220} backgroundColor="#f0f0f0" color="#0a0a0a" />
          </View>
          <Text style={styles.waiting}>Waiting for {contact.name} to scan...</Text>
          <ActivityIndicator color={colors.purple} style={{ marginTop: spacing.md }} />
        </ScrollView>
      )}

      {step === 'connecting' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.purple} size="large" />
          <Text style={styles.instruction}>Establishing encrypted channel...</Text>
        </View>
      )}

      {step === 'connected' && (
        <View style={styles.center}>
          <Text style={styles.connectedIcon}>✓</Text>
          <Text style={styles.instruction}>Connected!</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { fontSize: text.lg, color: colors.purpleLight, width: 32 },
  title: { fontSize: text.md, color: colors.text, fontWeight: '600', flex: 1, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  instruction: { fontSize: text.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  hintSmall: { fontSize: text.xs, color: colors.textMuted, textAlign: 'center', lineHeight: 18, marginTop: spacing.sm },
  btn: { width: '100%', backgroundColor: colors.purple, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', gap: spacing.xs },
  btnSecondary: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  btnText: { fontSize: text.md, color: colors.text, fontWeight: '600' },
  btnSub: { fontSize: text.xs, color: colors.purpleLight },
  divider: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: spacing.sm },
  dividerText: { fontSize: text.xs, color: colors.textMuted, fontFamily: 'Courier New' },
  qrWrap: { padding: spacing.lg, backgroundColor: '#f0f0f0', borderRadius: radius.lg },
  camera: { flex: 1 },
  scanLabel: { color: colors.text, fontSize: text.md, textAlign: 'center', padding: spacing.md },
  scanOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 240, height: 240, position: 'relative' },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: colors.purple, borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0 },
  cornerTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0 },
  waiting: { fontSize: text.sm, color: colors.textMuted, fontFamily: 'Courier New' },
  connectedIcon: { fontSize: 64, color: colors.green },
})
