/**
 * HomeScreen
 * Contact list, recent chats, add contact button
 */

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native'
import { colors, spacing, text, radius } from '../utils/tokens'
import { useStore } from '../store'
import { getContacts, Contact } from '../services/identity'
import { format } from 'date-fns'

interface Props {
  onOpenChat: (contact: Contact) => void
  onAddContact: () => void
  onOpenSettings: () => void
  onShowMyQR: () => void
}

export default function HomeScreen({
  onOpenChat,
  onAddContact,
  onOpenSettings,
  onShowMyQR,
}: Props) {
  const { profile, contacts, setContacts, session } = useStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadContacts()
  }, [])

  async function loadContacts() {
    try {
      const c = await getContacts()
      setContacts(c)
    } finally {
      setLoading(false)
    }
  }

  function renderContact({ item }: { item: Contact }) {
    const isActive = session?.contactId === item.deviceId
    return (
      <TouchableOpacity
        style={styles.contactRow}
        onPress={() => onOpenChat(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, isActive && styles.avatarActive]}>
          <Text style={styles.avatarText}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
          {isActive && <View style={styles.activeDot} />}
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          <Text style={styles.contactId} numberOfLines={1}>
            {item.deviceId.match(/.{4}/g)?.join(' ')}
          </Text>
        </View>
        <View style={styles.contactMeta}>
          {isActive && (
            <View style={styles.connectedBadge}>
              <Text style={styles.connectedText}>live</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onShowMyQR}>
          <Text style={styles.logo}>◈ GW</Text>
        </TouchableOpacity>
        <Text style={styles.profileName}>{profile?.name}</Text>
        <TouchableOpacity onPress={onOpenSettings} style={styles.settingsBtn}>
          <Text style={styles.settingsIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* Contact List */}
      {contacts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>◈</Text>
          <Text style={styles.emptyTitle}>No contacts yet</Text>
          <Text style={styles.emptyHint}>
            Scan a contact's QR code to add them.{'\n'}
            Share your QR so they can add you.
          </Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={onAddContact}>
            <Text style={styles.emptyBtnText}>Add First Contact</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(c) => c.deviceId}
          renderItem={renderContact}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* FAB */}
      {contacts.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={onAddContact}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
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
  logo: {
    fontSize: text.md,
    color: colors.purple,
    fontFamily: 'Courier New',
    fontWeight: '700',
    letterSpacing: 2,
  },
  profileName: {
    fontSize: text.md,
    color: colors.text,
    fontWeight: '600',
  },
  settingsBtn: {
    padding: spacing.xs,
  },
  settingsIcon: {
    fontSize: text.lg,
    color: colors.textSecondary,
  },
  list: {
    paddingVertical: spacing.sm,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.purpleDim,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarActive: {
    borderWidth: 2,
    borderColor: colors.green,
  },
  avatarText: {
    fontSize: text.lg,
    color: colors.purpleLight,
    fontWeight: '700',
  },
  activeDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: text.md,
    color: colors.text,
    fontWeight: '600',
  },
  contactId: {
    fontSize: text.xs,
    color: colors.textMuted,
    fontFamily: 'Courier New',
    marginTop: 2,
  },
  contactMeta: {
    alignItems: 'flex-end',
  },
  connectedBadge: {
    backgroundColor: colors.greenDim,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  connectedText: {
    fontSize: text.xs,
    color: colors.green,
    fontFamily: 'Courier New',
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 72,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyIcon: {
    fontSize: 48,
    color: colors.purpleDim,
  },
  emptyTitle: {
    fontSize: text.lg,
    color: colors.text,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: text.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyBtn: {
    backgroundColor: colors.purple,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  emptyBtnText: {
    fontSize: text.md,
    color: colors.text,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: colors.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabText: {
    fontSize: 28,
    color: colors.text,
    lineHeight: 32,
  },
})
