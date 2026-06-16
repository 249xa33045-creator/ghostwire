/**
 * QR Screens
 * MyQRScreen: show own QR for others to scan
 * ScanQRScreen: scan contact's QR → name prompt → save
 */

import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { colors, spacing, text, radius } from '../utils/tokens'
import { useStore } from '../store'
import {
  buildQRPayload,
  parseQRPayload,
  addContact,
  getContacts,
  QRPayload,
} from '../services/identity'

// ─── My QR Screen ─────────────────────────────────────────────────

interface MyQRProps {
  onClose: () => void
}

export function MyQRScreen({ onClose }: MyQRProps) {
  const { profile } = useStore()
  const [qrData, setQrData] = useState<string>('')

  useEffect(() => {
    if (profile) {
      setQrData(buildQRPayload(profile))
    }
  }, [profile])

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
        <Text style={styles.qrHint}>
          Show this to a contact so they can add you.{'\n'}
          Scan once — never again.
        </Text>

        <View style={styles.qrWrap}>
          {qrData ? (
            <QRCode
              value={qrData}
              size={240}
              backgroundColor={colors.text}
              color={colors.bg}
            />
          ) : (
            <ActivityIndicator color={colors.purple} />
          )}
        </View>

        <View style={styles.deviceIdWrap}>
          <Text style={styles.deviceIdLabel}>DEVICE ID</Text>
          <Text style={styles.deviceId}>
            {profile?.deviceId.match(/.{4}/g)?.join(' ') ?? '—'}
          </Text>
        </View>

        <Text style={styles.profileName}>{profile?.name}</Text>
      </View>
    </View>
  )
}

// ─── Scan QR Screen ───────────────────────────────────────────────

interface ScanQRProps {
  onClose: () => void
  onContactAdded: () => void
}

export function ScanQRScreen({ onClose, onContactAdded }: ScanQRProps) {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const [scannedPayload, setScannedPayload] = useState<QRPayload | null>(null)
  const [contactName, setContactName] = useState('')
  const [saving, setSaving] = useState(false)
  const { profile, setContacts } = useStore()

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission()
    }
  }, [])

  function handleScan({ data }: { data: string }) {
    if (scanned) return
    setScanned(true)

    const payload = parseQRPayload(data)
    if (!payload) {
      Alert.alert('Invalid QR', 'This QR code is not a Ghostwire contact.', [
        { text: 'Try Again', onPress: () => setScanned(false) },
      ])
      return
    }

    if (payload.deviceId === profile?.deviceId) {
      Alert.alert('That\'s you', 'You scanned your own QR code.', [
        { text: 'Try Again', onPress: () => setScanned(false) },
      ])
      return
    }

    setScannedPayload(payload)
  }

  async function handleSave() {
    if (!scannedPayload || !contactName.trim()) return
    setSaving(true)

    try {
      await addContact({
        deviceId: scannedPayload.deviceId,
        publicKeyJwk: scannedPayload.publicKeyJwk,
        name: contactName.trim(),
        addedAt: Date.now(),
      })
      const updated = await getContacts()
      setContacts(updated)
      onContactAdded()
    } catch (e) {
      Alert.alert('Error', 'Failed to save contact.')
    } finally {
      setSaving(false)
    }
  }

  // Name prompt after successful scan
  if (scannedPayload) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setScannedPayload(null)}>
            <Text style={styles.back}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>New Contact</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.namePrompt}>
          <View style={styles.successIcon}>
            <Text style={styles.successIconText}>✓</Text>
          </View>

          <Text style={styles.scanSuccess}>QR Scanned</Text>
          <Text style={styles.scannedId}>
            {scannedPayload.deviceId.match(/.{4}/g)?.join(' ')}
          </Text>

          <Text style={styles.nameLabel}>WHAT DO YOU CALL THIS PERSON?</Text>
          <TextInput
            style={styles.nameInput}
            value={contactName}
            onChangeText={setContactName}
            placeholder="Enter their name"
            placeholderTextColor={colors.textMuted}
            maxLength={32}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          <TouchableOpacity
            style={[
              styles.saveBtn,
              (!contactName.trim() || saving) && styles.saveBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={!contactName.trim() || saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save Contact</Text>
            )}
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
        <View style={styles.permDenied}>
          <Text style={styles.permText}>Camera permission needed to scan QR codes.</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Allow Camera</Text>
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
        </View>
      </CameraView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {
    fontSize: text.lg,
    color: colors.purpleLight,
    width: 32,
  },
  title: {
    fontSize: text.md,
    color: colors.text,
    fontWeight: '600',
  },
  qrSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  qrHint: {
    fontSize: text.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  qrWrap: {
    padding: spacing.lg,
    backgroundColor: colors.text,
    borderRadius: radius.lg,
  },
  deviceIdWrap: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  deviceIdLabel: {
    fontSize: text.xs,
    color: colors.textMuted,
    letterSpacing: 2,
    fontFamily: 'Courier New',
  },
  deviceId: {
    fontSize: text.sm,
    color: colors.purpleLight,
    fontFamily: 'Courier New',
    letterSpacing: 2,
  },
  profileName: {
    fontSize: text.lg,
    color: colors.text,
    fontWeight: '600',
  },
  camera: {
    flex: 1,
  },
  scanOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  scanFrame: {
    width: 240,
    height: 240,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: colors.purple,
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0 },
  cornerTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0 },
  scanHint: {
    fontSize: text.sm,
    color: colors.text,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  namePrompt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.greenDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconText: {
    fontSize: 28,
    color: colors.green,
  },
  scanSuccess: {
    fontSize: text.xl,
    color: colors.text,
    fontWeight: '700',
  },
  scannedId: {
    fontSize: text.xs,
    color: colors.textMuted,
    fontFamily: 'Courier New',
    letterSpacing: 2,
  },
  nameLabel: {
    fontSize: text.xs,
    color: colors.textSecondary,
    letterSpacing: 2,
    fontFamily: 'Courier New',
    marginTop: spacing.md,
  },
  nameInput: {
    width: '100%',
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: text.md,
    color: colors.text,
  },
  saveBtn: {
    width: '100%',
    backgroundColor: colors.purple,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    fontSize: text.md,
    color: colors.text,
    fontWeight: '600',
  },
  permDenied: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  permText: {
    fontSize: text.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  permBtn: {
    backgroundColor: colors.purple,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  permBtnText: {
    fontSize: text.md,
    color: colors.text,
    fontWeight: '600',
  },
})
