/**
 * Ghostwire App Root
 * Simple screen-based navigation (no React Navigation overhead for now)
 */

import React, { useEffect, useState } from 'react'
import { View, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { colors } from './src/utils/tokens'
import { useStore } from './src/store'
import { getProfile, getContacts, Contact } from './src/services/identity'
import { initDatabase } from './src/services/database'

import SetupScreen from './src/screens/SetupScreen'
import HomeScreen from './src/screens/HomeScreen'
import ChatScreen from './src/screens/ChatScreen'
import SettingsScreen from './src/screens/SettingsScreen'
import { MyQRScreen, ScanQRScreen } from './src/screens/QRScreens'

type Screen =
  | 'loading'
  | 'setup'
  | 'home'
  | 'chat'
  | 'settings'
  | 'myqr'
  | 'scanqr'

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [activeContact, setActiveContact] = useState<Contact | null>(null)
  const { setProfile, setContacts, setOnboarded } = useStore()

  useEffect(() => {
    bootstrap()
  }, [])

  async function bootstrap() {
    try {
      await initDatabase()
      const profile = await getProfile()
      if (!profile) {
        setScreen('setup')
        return
      }
      const contacts = await getContacts()
      setProfile(profile)
      setContacts(contacts)
      setOnboarded(true)
      setScreen('home')
    } catch (e) {
      console.error('[App] Bootstrap error', e)
      setScreen('setup')
    }
  }

  function openChat(contact: Contact) {
    setActiveContact(contact)
    setScreen('chat')
  }

  if (screen === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.purple} size="large" />
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>

          {screen === 'setup' && (
            <SetupScreen onComplete={() => setScreen('home')} />
          )}

          {screen === 'home' && (
            <HomeScreen
              onOpenChat={openChat}
              onAddContact={() => setScreen('scanqr')}
              onOpenSettings={() => setScreen('settings')}
              onShowMyQR={() => setScreen('myqr')}
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
              onResetComplete={() => {
                setScreen('setup')
              }}
            />
          )}

          {screen === 'myqr' && (
            <MyQRScreen onClose={() => setScreen('home')} />
          )}

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
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
