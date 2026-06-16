/**
 * SettingsScreen
 * Profile editing, contacts management, security, reset identity
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
} from 'react-native'
import { colors, spacing, text, radius } from '../utils/tokens'
import { useStore } from '../store'
import {
  updateProfileName,
  deleteIdentity,
  deleteContact,
  renameContact,
  getContacts,
  Contact,
} from '../services/identity'
import { wipeAllMessages } from '../services/database'

interface Props {
  onBack: () => void
  onResetComplete: () => void
}

type SettingsTab = 'profile' | 'contacts' | 'security'

export default function SettingsScreen({ onBack, onResetComplete }: Props) {
  const { profile, contacts, setProfile, setContacts } = useStore()
  const [tab, setTab] = useState<SettingsTab>('profile')
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(profile?.name ?? '')
  const [savingName, setSavingName] = useState(false)
  const [renamingContact, setRenamingContact] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // ─── Profile ────────────────────────────────────────────────────

  async function saveName() {
    if (!newName.trim()) return
    setSavingName(true)
    try {
      await updateProfileName(newName.trim())
      if (profile) setProfile({ ...profile, name: newName.trim() })
      setEditingName(false)
    } catch {
      Alert.alert('Error', 'Failed to update name.')
    } finally {
      setSavingName(false)
    }
  }

  // ─── Contacts ───────────────────────────────────────────────────

  async function handleRename(deviceId: string) {
    if (!renameValue.trim()) return
    try {
      await renameContact(deviceId, renameValue.trim())
      const updated = await getContacts()
      setContacts(updated)
      setRenamingContact(null)
      setRenameValue('')
    } catch {
      Alert.alert('Error', 'Failed to rename contact.')
    }
  }

  function confirmDeleteContact(contact: Contact) {
    Alert.alert(
      'Delete Contact',
      `Remove ${contact.name}? You'll need to re-scan their QR to add them again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteContact(contact.deviceId)
            const updated = await getContacts()
            setContacts(updated)
          },
        },
      ]
    )
  }

  // ─── Security / Reset ────────────────────────────────────────────

  function confirmReset() {
    Alert.alert(
      '⚠ Reset Identity',
      'This will permanently delete your identity, all contacts, and all message history.\n\nAll contacts must re-add you with a new QR scan.\n\nType RESET to confirm.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'I understand, Reset',
          style: 'destructive',
          onPress: confirmResetFinal,
        },
      ]
    )
  }

  function confirmResetFinal() {
    Alert.alert(
      'Last chance',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await wipeAllMessages()
              await deleteIdentity()
              onResetComplete()
            } catch {
              Alert.alert('Error', 'Reset failed. Try again.')
            }
          },
        },
      ]
    )
  }

  function confirmWipeAllMessages() {
    Alert.alert(
      'Wipe All Messages',
      'Delete all message history with all contacts? Contacts themselves are not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe All',
          style: 'destructive',
          onPress: async () => {
            await wipeAllMessages()
            Alert.alert('Done', 'All messages wiped.')
          },
        },
      ]
    )
  }

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['profile', 'contacts', 'security'] as SettingsTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>

        {/* ── PROFILE TAB ── */}
        {tab === 'profile' && (
          <View style={styles.section}>
            <Row label="DISPLAY NAME">
              {editingName ? (
                <View style={styles.editRow}>
                  <TextInput
                    style={styles.editInput}
                    value={newName}
                    onChangeText={setNewName}
                    autoFocus
                    maxLength={32}
                    returnKeyType="done"
                    onSubmitEditing={saveName}
                  />
                  <TouchableOpacity onPress={saveName} disabled={savingName}>
                    <Text style={styles.saveText}>
                      {savingName ? '...' : 'Save'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingName(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.editableRow}
                  onPress={() => {
                    setNewName(profile?.name ?? '')
                    setEditingName(true)
                  }}
                >
                  <Text style={styles.rowValue}>{profile?.name}</Text>
                  <Text style={styles.editHint}>edit</Text>
                </TouchableOpacity>
              )}
            </Row>

            <Row label="DEVICE ID">
              <Text style={styles.monoValue}>
                {profile?.deviceId.match(/.{4}/g)?.join(' ')}
              </Text>
            </Row>

            <Row label="CREATED">
              <Text style={styles.rowValue}>
                {profile?.createdAt
                  ? new Date(profile.createdAt).toLocaleDateString()
                  : '—'}
              </Text>
            </Row>

            <Row label="CONTACTS">
              <Text style={styles.rowValue}>{contacts.length}</Text>
            </Row>
          </View>
        )}

        {/* ── CONTACTS TAB ── */}
        {tab === 'contacts' && (
          <View style={styles.section}>
            {contacts.length === 0 ? (
              <Text style={styles.emptyText}>No contacts yet.</Text>
            ) : (
              contacts.map((c) => (
                <View key={c.deviceId} style={styles.contactCard}>
                  <View style={styles.contactCardLeft}>
                    <View style={styles.contactAvatar}>
                      <Text style={styles.contactAvatarText}>
                        {c.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      {renamingContact === c.deviceId ? (
                        <View style={styles.editRow}>
                          <TextInput
                            style={styles.editInput}
                            value={renameValue}
                            onChangeText={setRenameValue}
                            autoFocus
                            maxLength={32}
                            returnKeyType="done"
                            onSubmitEditing={() => handleRename(c.deviceId)}
                          />
                          <TouchableOpacity onPress={() => handleRename(c.deviceId)}>
                            <Text style={styles.saveText}>Save</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <Text style={styles.contactCardName}>{c.name}</Text>
                      )}
                      <Text style={styles.contactCardId}>
                        {c.deviceId.match(/.{4}/g)?.join(' ')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.contactCardActions}>
                    <TouchableOpacity
                      onPress={() => {
                        setRenamingContact(c.deviceId)
                        setRenameValue(c.name)
                      }}
                      style={styles.contactAction}
                    >
                      <Text style={styles.contactActionText}>rename</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => confirmDeleteContact(c)}
                      style={styles.contactAction}
                    >
                      <Text style={[styles.contactActionText, { color: colors.red }]}>
                        delete
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ── SECURITY TAB ── */}
        {tab === 'security' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MESSAGE HISTORY</Text>

            <TouchableOpacity style={styles.dangerBtn} onPress={confirmWipeAllMessages}>
              <Text style={styles.dangerBtnText}>Wipe All Messages</Text>
              <Text style={styles.dangerBtnSub}>
                Deletes all chat history. Contacts stay saved.
              </Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>IDENTITY</Text>

            <View style={styles.infoCard}>
              <Text style={styles.infoText}>
                Your identity is a cryptographic keypair stored on this device only.
                Resetting generates a new keypair and device ID — all contacts must
                re-scan your QR.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.dangerBtn, styles.dangerBtnRed]}
              onPress={confirmReset}
            >
              <Text style={[styles.dangerBtnText, { color: colors.red }]}>
                Reset Identity
              </Text>
              <Text style={styles.dangerBtnSub}>
                Irreversible. New device ID. Re-add all contacts.
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </View>
  )
}

// ─── Row Component ────────────────────────────────────────────────

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <View style={rowStyles.container}>
      <Text style={rowStyles.label}>{label}</Text>
      <View style={rowStyles.value}>{children}</View>
    </View>
  )
}

const rowStyles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  label: {
    fontSize: text.xs,
    color: colors.textMuted,
    fontFamily: 'Courier New',
    letterSpacing: 1,
  },
  value: {
    flexDirection: 'row',
    alignItems: 'center',
  },
})

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
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.purple,
  },
  tabText: {
    fontSize: text.sm,
    color: colors.textSecondary,
    fontFamily: 'Courier New',
  },
  tabTextActive: {
    color: colors.purpleLight,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: text.xs,
    color: colors.textMuted,
    fontFamily: 'Courier New',
    letterSpacing: 2,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  rowValue: {
    fontSize: text.md,
    color: colors.text,
  },
  monoValue: {
    fontSize: text.sm,
    color: colors.purpleLight,
    fontFamily: 'Courier New',
    letterSpacing: 2,
  },
  editableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  editHint: {
    fontSize: text.xs,
    color: colors.purple,
    fontFamily: 'Courier New',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  editInput: {
    flex: 1,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.purple,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: text.md,
    color: colors.text,
  },
  saveText: {
    fontSize: text.sm,
    color: colors.purple,
    fontWeight: '600',
  },
  cancelText: {
    fontSize: text.sm,
    color: colors.textSecondary,
  },
  emptyText: {
    fontSize: text.sm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
    fontFamily: 'Courier New',
  },
  contactCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.purpleDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactAvatarText: {
    fontSize: text.md,
    color: colors.purpleLight,
    fontWeight: '700',
  },
  contactCardName: {
    fontSize: text.md,
    color: colors.text,
    fontWeight: '600',
  },
  contactCardId: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: 'Courier New',
    letterSpacing: 1,
    marginTop: 2,
  },
  contactCardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  contactAction: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  contactActionText: {
    fontSize: text.xs,
    color: colors.textSecondary,
    fontFamily: 'Courier New',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  infoCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: {
    fontSize: text.sm,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  dangerBtn: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  dangerBtnRed: {
    borderColor: colors.redDim,
  },
  dangerBtnText: {
    fontSize: text.md,
    color: colors.text,
    fontWeight: '600',
  },
  dangerBtnSub: {
    fontSize: text.xs,
    color: colors.textMuted,
    lineHeight: 18,
  },
})
