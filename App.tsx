import React, { useEffect, useState } from 'react'
import { View, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { colors } from './src/utils/tokens'
import { useStore } from './src/store'
import { getProfile, getContacts, Contact } from './src/services/identity'
import * as SQLite from 'expo-sqlite'

import SetupScreen from './src/screens/SetupScreen'
import HomeScreen from './src/screens/HomeScreen'
import ChatScreen from './src/screens/ChatScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import ConnectScreen from './src/screens/ConnectScreen'
import { MyQRScreen, ScanQRScreen } from './src/screens/QRScreens'

type Screen = 'loading' | 'setup' | 'home' | 'connect' | 'chat' | 'settings' | 'myqr' | 'scanqr'

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [activeContact, setActiveContact] = useState<Contact | null>(null)
  const { setProfile, setContacts, setOnboarded } = useStore()

  useEffect(() => { bootstrap() }, [])

  async function bootstrap() {
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
      const profile = await getProfile()
      if (!profile) { setScreen('setup'); return }
      const contacts = await getContacts()
      setProfile(profile)
      setContacts(contacts)
      setOnboarded(true)
      setScreen('home')
    } catch {
      setScreen('setup')
    }
  }

  function openContact(contact: Contact) {
    setActiveContact(contact)
    setScreen('connect')
  }

  if (screen === 'loading') {
    return <View style={styles.loading}><ActivityIndicator color={colors.purple} size="large" /></View>
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          {screen === 'setup' && <SetupScreen onComplete={() => setScreen('home')} />}
          {screen === 'home' && (
            <HomeScreen
              onOpenChat={openContact}
              onAddContact={() => setScreen('scanqr')}
              onOpenSettings={() => setScreen('settings')}
              onShowMyQR={() => setScreen('myqr')}
            />
          )}
          {screen === 'connect' && activeContact && (
            <ConnectScreen
              contact={activeContact}
              onConnected={() => setScreen('chat')}
              onCancel={() => setScreen('home')}
            />
          )}
          {screen === 'chat' && activeContact && (
            <ChatScreen
              contact={activeContact}
              onBack={() => setScreen('home')}
              onDisconnect={() => setScreen('home')}
            />
          )}
          {screen === 'settings' && (
            <SettingsScreen
              onBack={() => setScreen('home')}
              onResetComplete={() => setScreen('setup')}
            />
          )}
          {screen === 'myqr' && <MyQRScreen onClose={() => setScreen('home')} />}
          {screen === 'scanqr' && (
            <ScanQRScreen
              onClose={() => setScreen('home')}
              onContactAdded={() => setScreen('home')}
            />
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safeArea: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
})
