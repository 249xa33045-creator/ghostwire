/**
 * ChatScreen
 * Full chat UI: messages, send, wipe, disconnect, fingerprint
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { colors, spacing, text, radius } from '../utils/tokens'
import { useStore } from '../store'
import { Contact } from '../services/identity'
import { Message, saveMessage, getMessages, wipeContactMessages } from '../services/database'
import { webrtcService } from '../services/webrtc'
import {
  deriveSharedSecret,
  importPrivateKey,
  importPublicKey,
  generateFingerprint,
} from '../services/crypto'
import { getProfile, getContactPublicKey } from '../services/identity'
import { format } from 'date-fns'
import { v4 as uuid } from 'uuid'

interface Props {
  contact: Contact
  onBack: () => void
  onDisconnect: () => void
}

export default function ChatScreen({ contact, onBack, onDisconnect }: Props) {
  const { messages, addMessage, setMessages, clearMessages, session, setSession, setConnectionState, connectionState } = useStore()
  const [input, setInput] = useState('')
  const [fingerprint, setFingerprint] = useState('')
  const [fpVerified, setFpVerified] = useState(false)
  const [connecting, setConnecting] = useState(true)
  const flatRef = useRef<FlatList>(null)
  const sessionKeyRef = useRef<CryptoKey | null>(null)

  useEffect(() => {
    initSession()
    return () => {
      // Don't auto-disconnect on unmount — user stays connected
    }
  }, [])

  async function initSession() {
    setConnecting(true)
    try {
      const profile = await getProfile()
      if (!profile) throw new Error('No profile')

      const myPrivKey = await importPrivateKey(profile.privateKeyJwk)
      const contactPubKey = await importPublicKey(contact.publicKeyJwk)
      const sharedSecret = await deriveSharedSecret(myPrivKey, contactPubKey)
      sessionKeyRef.current = sharedSecret

      // Generate fingerprint
      const fp = await generateFingerprint(profile.publicKeyJwk, contact.publicKeyJwk)
      setFingerprint(fp)

      // Load existing messages from DB
      const existing = await getMessages(contact.deviceId, sharedSecret)
      setMessages(existing)

      // Set up WebRTC callbacks
      webrtcService.init({
        onMessage: async (content) => {
          if (!sessionKeyRef.current) return
          const msg: Message = {
            id: uuid(),
            contactId: contact.deviceId,
            content,
            timestamp: Date.now(),
            direction: 'received',
            status: 'delivered',
          }
          await saveMessage(msg, sessionKeyRef.current)
          addMessage(msg)
          scrollToBottom()
        },
        onConnected: () => {
          setConnectionState('connected')
          setConnecting(false)
        },
        onDisconnected: () => {
          setConnectionState('disconnected')
        },
        onError: (err) => console.error('[WebRTC]', err),
        onIceCandidate: () => {},
      })

      webrtcService.setSharedSecret(sharedSecret)

    } catch (e) {
      console.error('[Chat] Init failed', e)
      setConnecting(false)
    }
  }

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
  }, [])

  async function sendMessage() {
    const content = input.trim()
    if (!content || !sessionKeyRef.current) return

    setInput('')

    const msg: Message = {
      id: uuid(),
      contactId: contact.deviceId,
      content,
      timestamp: Date.now(),
      direction: 'sent',
      status: 'sending',
    }

    addMessage(msg)
    scrollToBottom()

    const sent = await webrtcService.sendMessage(content)

    if (sent && sessionKeyRef.current) {
      await saveMessage({ ...msg, status: 'delivered' }, sessionKeyRef.current)
    }
  }

  function handleWipe() {
    Alert.alert(
      'Wipe Chat',
      'Delete all messages with this contact? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe',
          style: 'destructive',
          onPress: async () => {
            await wipeContactMessages(contact.deviceId)
            clearMessages()
          },
        },
      ]
    )
  }

  function handleDisconnect() {
    Alert.alert(
      'Disconnect',
      'End this session? Messages will remain until you wipe them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            webrtcService.close()
            sessionKeyRef.current = null
            setSession(null)
            setConnectionState('idle')
            onDisconnect()
          },
        },
      ]
    )
  }

  function renderMessage({ item }: { item: Message }) {
    const isSent = item.direction === 'sent'
    return (
      <View style={[styles.msgRow, isSent && styles.msgRowSent]}>
        <View style={[styles.bubble, isSent ? styles.bubbleSent : styles.bubbleReceived]}>
          <Text style={[styles.bubbleText, isSent ? styles.bubbleTextSent : styles.bubbleTextReceived]}>
            {item.content}
          </Text>
          <View style={styles.bubbleMeta}>
            <Text style={styles.bubbleTime}>
              {format(item.timestamp, 'HH:mm')}
            </Text>
            {isSent && (
              <Text style={styles.bubbleStatus}>
                {item.status === 'sending' ? '○' : '●'}
              </Text>
            )}
          </View>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerName}>{contact.name}</Text>
          <View style={styles.statusRow}>
            <View style={[
              styles.statusDot,
              connectionState === 'connected' ? styles.statusGreen
              : connectionState === 'connecting' ? styles.statusYellow
              : styles.statusRed
            ]} />
            <Text style={styles.statusText}>
              {connectionState === 'connected' ? 'connected'
               : connectionState === 'connecting' ? 'connecting...'
               : 'disconnected'}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleWipe} style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>wipe</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDisconnect} style={styles.actionBtn}>
            <Text style={[styles.actionBtnText, styles.disconnectText]}>end</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Fingerprint Bar */}
      <TouchableOpacity
        style={[styles.fpBar, fpVerified && styles.fpBarVerified]}
        onPress={() => {
          Alert.alert(
            'Security Fingerprint',
            `Both you and ${contact.name} should see:\n\n${fingerprint}\n\nIf it matches, connection is secure. No one is intercepting.`,
            [
              { text: 'Does not match', style: 'destructive' },
              {
                text: 'Matches ✓',
                onPress: () => setFpVerified(true),
              },
            ]
          )
        }}
      >
        <Text style={styles.fpLabel}>FINGERPRINT</Text>
        <Text style={styles.fpValue}>{fingerprint || '—'}</Text>
        <Text style={styles.fpStatus}>{fpVerified ? '✓ verified' : 'tap to verify'}</Text>
      </TouchableOpacity>

      {/* Messages */}
      {connecting ? (
        <View style={styles.connecting}>
          <ActivityIndicator color={colors.purple} />
          <Text style={styles.connectingText}>Establishing encrypted channel...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onLayout={scrollToBottom}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>
                Channel open. Messages are end-to-end encrypted.
              </Text>
            </View>
          }
        />
      )}

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message..."
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={4000}
          returnKeyType="send"
          onSubmitEditing={sendMessage}
          blurOnSubmit={false}
          editable={connectionState === 'connected'}
        />
        <TouchableOpacity
          style={[
            styles.sendBtn,
            (!input.trim() || connectionState !== 'connected') && styles.sendBtnDisabled,
          ]}
          onPress={sendMessage}
          disabled={!input.trim() || connectionState !== 'connected'}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  backBtn: {
    padding: spacing.xs,
  },
  backText: {
    fontSize: text.lg,
    color: colors.purpleLight,
  },
  headerCenter: {
    flex: 1,
  },
  headerName: {
    fontSize: text.md,
    color: colors.text,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
  },
  statusGreen: { backgroundColor: colors.green },
  statusYellow: { backgroundColor: colors.yellow },
  statusRed: { backgroundColor: colors.red },
  statusText: {
    fontSize: text.xs,
    color: colors.textSecondary,
    fontFamily: 'Courier New',
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnText: {
    fontSize: text.xs,
    color: colors.textSecondary,
    fontFamily: 'Courier New',
  },
  disconnectText: {
    color: colors.red,
  },
  fpBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  fpBarVerified: {
    backgroundColor: colors.greenDim,
  },
  fpLabel: {
    fontSize: 9,
    color: colors.textMuted,
    fontFamily: 'Courier New',
    letterSpacing: 1,
  },
  fpValue: {
    flex: 1,
    fontSize: text.xs,
    color: colors.purpleLight,
    fontFamily: 'Courier New',
    letterSpacing: 2,
  },
  fpStatus: {
    fontSize: 9,
    color: colors.textMuted,
    fontFamily: 'Courier New',
  },
  connecting: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  connectingText: {
    fontSize: text.sm,
    color: colors.textSecondary,
    fontFamily: 'Courier New',
  },
  messageList: {
    padding: spacing.md,
    gap: spacing.sm,
    flexGrow: 1,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  msgRowSent: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleSent: {
    backgroundColor: colors.bubbleSent,
    borderBottomRightRadius: radius.sm,
  },
  bubbleReceived: {
    backgroundColor: colors.bubbleReceived,
    borderBottomLeftRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: {
    fontSize: text.md,
    lineHeight: 22,
  },
  bubbleTextSent: {
    color: colors.bubbleSentText,
  },
  bubbleTextReceived: {
    color: colors.bubbleReceivedText,
  },
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  bubbleTime: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: 'Courier New',
  },
  bubbleStatus: {
    fontSize: 8,
    color: colors.purpleLight,
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyChatText: {
    fontSize: text.sm,
    color: colors.textMuted,
    textAlign: 'center',
    fontFamily: 'Courier New',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: text.md,
    color: colors.text,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.3,
  },
  sendBtnText: {
    fontSize: text.lg,
    color: colors.text,
    fontWeight: '700',
  },
})
