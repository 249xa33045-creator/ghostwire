import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, StyleSheet, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native'
import { colors, spacing, text, radius } from '../utils/tokens'
import { useStore } from '../store'
import { Contact, getProfile } from '../services/identity'
import { encryptMessage, decryptMessage, generateFingerprint } from '../services/crypto'
import { webrtcService } from '../services/webrtc'
import { format } from 'date-fns'
import * as SQLite from 'expo-sqlite'

interface Message {
  id: string
  content: string
  timestamp: number
  direction: 'sent' | 'received'
  status: 'sending' | 'delivered' | 'failed' | 'pending'
}

interface Props {
  contact: Contact
  onBack: () => void
  onDisconnect: () => void
}

let msgCounter = 0

export default function ChatScreen({ contact, onBack, onDisconnect }: Props) {
  const { connectionState, setConnectionState } = useStore()
  const [messages, setMessages] = useState<Message[]>([])
  const messagesRef = useRef<Message[]>([])
  useEffect(() => { messagesRef.current = messages }, [messages])
  const [input, setInput] = useState('')
  const [fingerprint, setFingerprint] = useState('')
  const [fpVerified, setFpVerified] = useState(false)
  const flatRef = useRef<FlatList>(null)
  const myKeyRef = useRef<string>('')

  useEffect(() => {
    setup()
    return () => {}
  }, [])

  async function setup() {
    const profile = await getProfile()
    if (!profile) return
    myKeyRef.current = profile.sharedKey

    // Sync actual current connection state immediately on mount
    // (connection may have already succeeded in ConnectScreen before navigating here)
    if (webrtcService.isConnected()) {
      setConnectionState('connected')
    }

    // Generate fingerprint from both keys
    const fp = await generateFingerprint(profile.sharedKey, contact.sharedKey)
    setFingerprint(fp)

    // Load messages from SQLite
    loadMessages()

    // Wire WebRTC callbacks
    webrtcService.init({
      onMessage: async (encrypted: string) => {
        try {
          // Always decrypt with OUR OWN key - the sender encrypted it
          // using our sharedKey (taken from our QR) so only we can read it
          const content = await decryptMessage(myKeyRef.current, encrypted)
          const msg: Message = {
            id: String(++msgCounter),
            content,
            timestamp: Date.now(),
            direction: 'received',
            status: 'delivered',
          }
          saveMessageToDB(msg)
          setMessages(prev => [...prev, msg])
          scrollToBottom()
        } catch {
          console.error('Failed to decrypt incoming message')
        }
      },
      onConnected: () => {
        setConnectionState('connected')
        flushPendingMessages()
      },
      onDisconnected: () => setConnectionState('disconnected'),
      onError: (e) => console.error('[WebRTC]', e),
    })
  }

  async function flushPendingMessages() {
    // Resend any messages that were queued while disconnected
    const stillPending = messagesRef.current.filter(m => m.direction === 'sent' && m.status === 'pending')
    for (const msg of stillPending) {
      try {
        const encrypted = await encryptMessage(contact.sharedKey, msg.content)
        const sent = await webrtcService.send(encrypted)
        if (sent) {
          const updated = { ...msg, status: 'delivered' as const }
          saveMessageToDB(updated)
          setMessages(prev => prev.map(m => m.id === msg.id ? updated : m))
        }
      } catch {
        // leave as pending, will retry on next connect
      }
    }
  }

  function loadMessages() {
    try {
      const db = SQLite.openDatabaseSync('ghostwire.db')
      const rows = db.getAllSync<any>(
        'SELECT * FROM messages WHERE contact_id = ? ORDER BY timestamp ASC',
        contact.deviceId
      )
      const loaded: Message[] = rows.map((r: any) => ({
        id: r.id,
        content: r.content_encrypted, // stored as plaintext for now
        timestamp: r.timestamp,
        direction: r.direction,
        status: r.status,
      }))
      setMessages(loaded)
    } catch (e) {
      console.error('Load messages error', e)
    }
  }

  function saveMessageToDB(msg: Message) {
    try {
      const db = SQLite.openDatabaseSync('ghostwire.db')
      db.runSync(
        'INSERT OR REPLACE INTO messages (id, contact_id, content_encrypted, timestamp, direction, status) VALUES (?, ?, ?, ?, ?, ?)',
        msg.id, contact.deviceId, msg.content, msg.timestamp, msg.direction, msg.status
      )
    } catch (e) {
      console.error('Save message error', e)
    }
  }

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
  }, [])

  async function sendMessage() {
    const content = input.trim()
    if (!content) return
    setInput('')

    const msg: Message = {
      id: String(++msgCounter),
      content,
      timestamp: Date.now(),
      direction: 'sent',
      status: 'sending',
    }
    setMessages(prev => [...prev, msg])
    scrollToBottom()

    try {
      // Encrypt with contact's key so they can decrypt
      const encrypted = await encryptMessage(contact.sharedKey, content)
      const sent = webrtcService.isConnected() ? await webrtcService.send(encrypted) : false
      // Not connected or send failed -> mark pending, will auto-send on next connect
      const updated = { ...msg, status: sent ? 'delivered' : 'pending' } as Message
      saveMessageToDB(updated)
      setMessages(prev => prev.map(m => m.id === msg.id ? updated : m))
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'pending' } : m))
    }
  }

  function handleWipe() {
    Alert.alert('Wipe Chat', 'Delete all messages with this contact?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Wipe', style: 'destructive',
        onPress: () => {
          try {
            const db = SQLite.openDatabaseSync('ghostwire.db')
            db.runSync('DELETE FROM messages WHERE contact_id = ?', contact.deviceId)
            setMessages([])
          } catch {}
        }
      }
    ])
  }

  function handleDisconnect() {
    Alert.alert('Disconnect', 'End this session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive',
        onPress: () => {
          webrtcService.close()
          setConnectionState('idle')
          onDisconnect()
        }
      }
    ])
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
            <Text style={styles.bubbleTime}>{format(item.timestamp, 'HH:mm')}</Text>
            {isSent && (
              <Text style={styles.bubbleStatus}>
                {item.status === 'sending' ? '○' : item.status === 'failed' ? '✗' : '●'}
              </Text>
            )}
          </View>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerName}>{contact.name}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot,
              connectionState === 'connected' ? styles.statusGreen
              : connectionState === 'connecting' ? styles.statusYellow
              : styles.statusRed
            ]} />
            <Text style={styles.statusText}>{connectionState}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleWipe} style={styles.actionBtn}>
          <Text style={styles.actionBtnText}>wipe</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDisconnect} style={styles.actionBtn}>
          <Text style={[styles.actionBtnText, { color: colors.red }]}>end</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.fpBar, fpVerified && styles.fpBarVerified]}
        onPress={() => Alert.alert(
          'Security Fingerprint',
          `Both you and ${contact.name} should see:\n\n${fingerprint}\n\nIf it matches, connection is secure.`,
          [
            { text: 'Does not match', style: 'destructive' },
            { text: 'Matches ✓', onPress: () => setFpVerified(true) }
          ]
        )}
      >
        <Text style={styles.fpLabel}>FINGERPRINT</Text>
        <Text style={styles.fpValue}>{fingerprint || '—'}</Text>
        <Text style={styles.fpStatus}>{fpVerified ? '✓' : 'tap to verify'}</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onLayout={scrollToBottom}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatText}>
              {connectionState === 'connected'
                ? 'Channel open. Messages are end-to-end encrypted.'
                : 'Not connected. Go back and connect first.'}
            </Text>
          </View>
        }
      />

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message..."
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={4000}
          editable={connectionState === 'connected'}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || connectionState !== 'connected') && styles.sendBtnDisabled]}
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
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  backText: { fontSize: text.lg, color: colors.purpleLight },
  headerCenter: { flex: 1 },
  headerName: { fontSize: text.md, color: colors.text, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusGreen: { backgroundColor: colors.green },
  statusYellow: { backgroundColor: colors.yellow },
  statusRed: { backgroundColor: colors.red },
  statusText: { fontSize: text.xs, color: colors.textSecondary, fontFamily: 'Courier New' },
  actionBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  actionBtnText: { fontSize: text.xs, color: colors.textSecondary, fontFamily: 'Courier New' },
  fpBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.bgCard, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  fpBarVerified: { backgroundColor: colors.greenDim },
  fpLabel: { fontSize: 9, color: colors.textMuted, fontFamily: 'Courier New', letterSpacing: 1 },
  fpValue: { flex: 1, fontSize: text.xs, color: colors.purpleLight, fontFamily: 'Courier New', letterSpacing: 2 },
  fpStatus: { fontSize: 9, color: colors.textMuted, fontFamily: 'Courier New' },
  messageList: { padding: spacing.md, flexGrow: 1 },
  msgRow: { flexDirection: 'row', marginBottom: spacing.sm },
  msgRowSent: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleSent: { backgroundColor: colors.bubbleSent, borderBottomRightRadius: radius.sm },
  bubbleReceived: { backgroundColor: colors.bubbleReceived, borderBottomLeftRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontSize: text.md, lineHeight: 22 },
  bubbleTextSent: { color: colors.bubbleSentText },
  bubbleTextReceived: { color: colors.bubbleReceivedText },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs, marginTop: spacing.xs },
  bubbleTime: { fontSize: 10, color: colors.textMuted, fontFamily: 'Courier New' },
  bubbleStatus: { fontSize: 8, color: colors.purpleLight },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyChatText: { fontSize: text.sm, color: colors.textMuted, textAlign: 'center', fontFamily: 'Courier New', lineHeight: 22 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  input: { flex: 1, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: text.md, color: colors.text, maxHeight: 120 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.3 },
  sendBtnText: { fontSize: text.lg, color: colors.text, fontWeight: '700' },
})
