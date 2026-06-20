import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { colors, spacing, text, radius } from '../utils/tokens'
import { useStore } from '../store'
import {
  addContact, getContacts,
  buildQRPayload, parseQRPayload,
} from '../services/identity'

export function MyQRScreen({ onClose }: { onClose: () => void }) {
  const { profile } = useStore()
  const qrData = profile ? buildQRPayload(profile) : ''

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.back}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My QR Code</Text>
        <View style={{ width: 32 }} />
      </View>
      <View style={styles.qrSection}>
        <Text style={styles.hint}>
          Show this to a contact, or share a screenshot with someone far away.{'\n'}
          Scan once — never again.
        </Text>
        <View style={styles.qrWrap}>
          {qrData ? (
            <QRCode value={qrData} size={240} backgroundColor="#f0f0f0" color="#0a0a0a" />
          ) : (
            <ActivityIndicator color={colors.purple} />
          )}
        </View>
        <Text style={styles.idLabel}>DEVICE ID</Text>
        <Text style={styles.idValue}>
          {profile?.deviceId?.match(/.{4}/g)?.join(' ') ?? '—'}
        </Text>
        <Text style={styles.name}>{profile?.name}</Text>
        <Text style={styles.shareHint}>
          Tip: take a screenshot and send it via WhatsApp, Telegram, etc.{'\n'}
          They can add you using "Pick from Gallery" on their end.
        </Text>
      </View>
    </View>
  )
}

export function ScanQRScreen({
  onClose,
  onContactAdded
}: {
  onClose: () => void
  onContactAdded: () => void
}) {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const [scannedPayload, setScannedPayload] = useState<{ deviceId: string, sharedKey: string } | null>(null)
  const [contactName, setContactName] = useState('')
  const [saving, setSaving] = useState(false)
  const [pickingImage, setPickingImage] = useState(false)
  const { profile, setContacts } = useStore()

  useEffect(() => {
    if (!permission?.granted) requestPermission()
  }, [])

  function processScannedData(data: string) {
    const payload = parseQRPayload(data)
    if (!payload) {
      Alert.alert('Invalid QR', 'Not a Ghostwire contact code.', [
        { text: 'OK', onPress: () => setScanned(false) }
      ])
      return
    }
    if (payload.deviceId === profile?.deviceId) {
      Alert.alert("That's you", 'This is your own QR code.', [
        { text: 'OK', onPress: () => setScanned(false) }
      ])
      return
    }
    setScannedPayload({ deviceId: payload.deviceId, sharedKey: payload.sharedKey })
  }

  function handleScan({ data }: { data: string }) {
    if (scanned) return
    setScanned(true)
    processScannedData(data)
  }

  async function pickFromGallery() {
    setPickingImage(true)
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      })

      if (result.canceled || !result.assets?.[0]) {
        setPickingImage(false)
        return
      }

      const imageUri = result.assets[0].uri

      // Use expo-camera's Scanner via a temporary scan, OR
      // decode using a barcode reading library on the image
      const { Camera } = await import('expo-camera')
      const scanResult = await (Camera as any).scanFromURLAsync(imageUri, ['qr'])

      if (scanResult && scanResult.length > 0) {
        processScannedData(scanResult[0].data)
      } else {
        Alert.alert('No QR Found', 'Could not detect a QR code in that image. Try a clearer screenshot.')
      }
    } catch (e: any) {
      Alert.alert('Error', 'Could not read QR from image: ' + (e.message || 'unknown error'))
    } finally {
      setPickingImage(false)
    }
  }

  async function handleSave() {
    if (!scannedPayload || !contactName.trim()) return
    setSaving(true)
    try {
      await addContact({
        deviceId: scannedPayload.deviceId,
        name: contactName.trim(),
        sharedKey: scannedPayload.sharedKey,
        addedAt: Date.now(),
      })
      const updated = await getContacts()
      setContacts(updated)
      onContactAdded()
    } catch {
      Alert.alert('Error', 'Failed to save contact.')
    } finally {
      setSaving(false)
    }
  }

  if (scannedPayload) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setScannedPayload(null); setScanned(false) }}>
            <Text style={styles.back}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>New Contact</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.namePrompt}>
          <View style={styles.successIcon}>
            <Text style={styles.successText}>✓</Text>
          </View>
          <Text style={styles.scanSuccess}>QR Scanned</Text>
          <Text style={styles.scannedId}>
            {scannedPayload.deviceId.match(/.{4}/g)?.join(' ')}
          </Text>
          <Text style={styles.idLabel}>WHAT DO YOU CALL THIS PERSON?</Text>
          <TextInput
            style={styles.nameInput}
            value={contactName}
            onChangeText={setContactName}
            placeholder="Enter their name"
            placeholderTextColor={colors.textMuted}
            maxLength={32}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.saveBtn, (!contactName.trim() || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!contactName.trim() || saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Save Contact</Text>}
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  if (!permission?.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.back}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Scan QR</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={styles.namePrompt}>
          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
            Camera permission needed to scan QR codes.
          </Text>
          <TouchableOpacity style={styles.saveBtn} onPress={requestPermission}>
            <Text style={styles.saveBtnText}>Allow Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.galleryBtn} onPress={pickFromGallery} disabled={pickingImage}>
            {pickingImage
              ? <ActivityIndicator color={colors.purpleLight} />
              : <Text style={styles.galleryBtnText}>Or pick from gallery instead</Text>}
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.back}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Scan Contact QR</Text>
        <View style={{ width: 32 }} />
      </View>
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={handleScan}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      >
        <View style={styles.scanOverlay}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.scanHint}>Align QR code within the frame</Text>

          <TouchableOpacity style={styles.galleryFab} onPress={pickFromGallery} disabled={pickingImage}>
            {pickingImage ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.galleryFabIcon}>🖼</Text>
                <Text style={styles.galleryFabText}>Pick from Gallery</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { fontSize: text.lg, color: colors.purpleLight, width: 32 },
  title: { fontSize: text.md, color: colors.text, fontWeight: '600' },
  qrSection: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl },
  hint: { fontSize: text.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  qrWrap: { padding: spacing.lg, backgroundColor: '#f0f0f0', borderRadius: radius.lg },
  idLabel: { fontSize: text.xs, color: colors.textMuted, letterSpacing: 2, fontFamily: 'Courier New', marginTop: spacing.sm },
  idValue: { fontSize: text.sm, color: colors.purpleLight, fontFamily: 'Courier New', letterSpacing: 2 },
  name: { fontSize: text.lg, color: colors.text, fontWeight: '600' },
  shareHint: { fontSize: text.xs, color: colors.textMuted, textAlign: 'center', lineHeight: 18, marginTop: spacing.md },
  camera: { flex: 1 },
  scanOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  scanFrame: { width: 240, height: 240, position: 'relative' },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: colors.purple, borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0 },
  cornerTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0 },
  scanHint: { fontSize: text.sm, color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  galleryFab: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: 'rgba(124,58,237,0.9)', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, marginTop: spacing.md },
  galleryFabIcon: { fontSize: text.md },
  galleryFabText: { fontSize: text.sm, color: '#fff', fontWeight: '600' },
  galleryBtn: { marginTop: spacing.md },
  galleryBtnText: { fontSize: text.sm, color: colors.purpleLight, textDecorationLine: 'underline' },
  namePrompt: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.greenDim, alignItems: 'center', justifyContent: 'center' },
  successText: { fontSize: 28, color: colors.green },
  scanSuccess: { fontSize: text.xl, color: colors.text, fontWeight: '700' },
  scannedId: { fontSize: text.xs, color: colors.textMuted, fontFamily: 'Courier New', letterSpacing: 2 },
  nameInput: { width: '100%', backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: text.md, color: colors.text },
  saveBtn: { width: '100%', backgroundColor: colors.purple, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: text.md, color: colors.text, fontWeight: '600' },
})
