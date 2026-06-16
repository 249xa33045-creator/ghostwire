/**
 * Ghostwire App Store
 * Global state: profile, active session, messages
 */

import { create } from 'zustand'
import { MyProfile, Contact } from '../services/identity'
import { Message } from '../services/database'

interface ActiveSession {
  contactId: string
  sharedSecret: CryptoKey
  fingerprint: string
  connectedAt: number
  mode: 'lan' | 'remote'
}

interface AppState {
  // Identity
  profile: MyProfile | null
  contacts: Contact[]
  isOnboarded: boolean

  // Active session
  session: ActiveSession | null
  connectionState: 'idle' | 'connecting' | 'connected' | 'disconnected'

  // Messages (current session only — full history from DB)
  messages: Message[]

  // Actions
  setProfile: (profile: MyProfile) => void
  setContacts: (contacts: Contact[]) => void
  setOnboarded: (v: boolean) => void
  setSession: (session: ActiveSession | null) => void
  setConnectionState: (state: AppState['connectionState']) => void
  addMessage: (msg: Message) => void
  setMessages: (msgs: Message[]) => void
  clearMessages: () => void
  updateMessageStatus: (id: string, status: Message['status']) => void
}

export const useStore = create<AppState>((set) => ({
  profile: null,
  contacts: [],
  isOnboarded: false,
  session: null,
  connectionState: 'idle',
  messages: [],

  setProfile: (profile) => set({ profile }),
  setContacts: (contacts) => set({ contacts }),
  setOnboarded: (v) => set({ isOnboarded: v }),
  setSession: (session) => set({ session }),
  setConnectionState: (connectionState) => set({ connectionState }),
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  setMessages: (messages) => set({ messages }),
  clearMessages: () => set({ messages: [] }),
  updateMessageStatus: (id, status) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, status } : m
      ),
    })),
}))
