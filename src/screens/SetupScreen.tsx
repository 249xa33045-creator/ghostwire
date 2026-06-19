import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native'
import * as SecureStore from 'expo-secure-store'
import * as SQLite from 'expo-sqlite'
import { colors, spacing, text, radius } from '../utils/tokens'
import { createIdentity } from '../services/identity'
import { useStore } from '../store'

export default function SetupScreen({ onComplete }: { onComplete: () => void }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setProfile, setOnboarded } = useStore()

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Enter a name to continue'); return }
    if (trimmed.length > 32) { setError('Name too long (max 32 chars)'); return }
    setLoading(true)
    setError('')
    try {
      const db = SQLite.openDatabaseSync('ghostwire.db')
      db.execSync(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL,
        content_encrypted TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        direction TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'delivered'
      )`)
      const profile = await createIdentity(trimmed)
      setProfile(profile)
      setOnboarded(true)
      onComplete()
    } catch (e: any) {
      setError('Failed to create identity. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <View style={styles.logoWrap}>
          <Text style={styles.logoSymbol}>◈</Text>
          <Text style={styles.logoText}>GHOSTWIRE</Text>
          <Text style={styles.logoSub}>encrypted · offline · ephemeral</Text>
        </View>
        <View style={styles.form}>
          <Text style={styles.label}>DISPLAY NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="what should contacts call you?"
            placeholderTextColor={colors.textMuted}
            maxLength={32}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
          <Text style={styles.hint}>This name is stored locally only. Contacts can rename you on their side.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleCreate} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.text} size="small" /> : <Text style={styles.buttonText}>Generate Identity</Text>}
          </TouchableOpacity>
        </View>
        <Text style={styles.footer}>No phone number. No email. No account.{'\n'}Your identity lives on this device only.</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.xl },
  logoWrap: { alignItems: 'center', gap: spacing.xs },
  logoSymbol: { fontSize: 48, color: colors.purple },
  logoText: { fontSize: text.xxl, fontFamily: 'Courier New', fontWeight: '700', color: colors.text, letterSpacing: 8 },
  logoSub: { fontSize: text.xs, color: colors.textMuted, letterSpacing: 2 },
  form: { gap: spacing.sm },
  label: { fontSize: text.xs, color: colors.textSecondary, letterSpacing: 2, fontFamily: 'Courier New' },
  input: { backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: text.md, color: colors.text },
  hint: { fontSize: text.xs, color: colors.textMuted, lineHeight: 18 },
  error: { fontSize: text.sm, color: colors.red },
  button: { backgroundColor: colors.purple, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: text.md, color: colors.text, fontWeight: '600', letterSpacing: 1 },
  footer: { fontSize: text.xs, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
})
