/**
 * ConnectScreen
 * QR-based WebRTC SDP exchange for same-WiFi P2P connection
 * 
 * HOST flow:   Create offer → show QR → scan guest's answer QR → connected
 * GUEST flow:  Scan host's offer QR → show answer QR → connected
 */

import React, { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { colors, spacing, text, radius } from '../utils/tokens'
import { webrtcService } from '../services/webrtc'
import { Contact } from '../services/identity'

type Step =
  | 'choose'           // pick host or guest
  | 'host_generating'  // creating offer
  | 'host_show_qr'     // showing offer QR
  | 'host_scanning'    // scanning guest's answer
  | 'guest_scanning'   // scanning host's offer
  | 'guest_show_qr'    // showing answer QR
  | 'connecting'       // WebRTC connecting
  | 'connected'

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
    return () => { webrtcService.close() }
  }, [])

  // ── HOST ──────────────────────────────────────────────

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

  // ── GUEST ─────────────────────────────────────────────

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
          <Text style={styles.instruction}>
            Both devices must be on the same WiFi or hotspot.{'\n\n'}
            One person is the Host, the other is the Guest.
          </Text>
          <TouchableOpacity style={styles.btn} onPress={startAsHost}>
            <Text style={styles.btnText}>I am the Host</Text>
            <Text style={styles.btnSub}>Creates the connection</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={startAsGuest}>
            <Text style={styles.btnText}>I am the Guest</Text>
            <Text style={styles.btnSub}>Joins the connection</Text>
          </TouchableOpacity>
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
          <Text style={styles.instruction}>
            Show this QR to {contact.name}.{'\n'}
            They will scan it on their device.
          </Text>
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
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={handleHostScanAnswer}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          >
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
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={handleGuestScanOffer}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          >
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
          <Text style={styles.instruction}>
            Show this QR to {contact.name}.{'\n'}
            They will scan it to complete the connection.
          </Text>
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
  btn: { width: '100%', backgroundColor: colors.purple, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', gap: spacing.xs },
  btnSecondary: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  btnText: { fontSize: text.md, color: colors.text, fontWeight: '600' },
  btnSub: { fontSize: text.xs, color: colors.purpleLight },
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
