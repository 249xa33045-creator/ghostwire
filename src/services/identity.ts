import * as SecureStore from 'expo-secure-store'
import { generateDeviceId, generateSharedKey } from './crypto'

export interface MyProfile {
  deviceId: string
  name: string
  sharedKey: string   // included in QR so contacts can encrypt to us
  createdAt: number
}

export interface Contact {
  deviceId: string
  name: string
  sharedKey: string   // their key from QR scan
  addedAt: number
}

const KEYS = {
  PROFILE: 'gw_profile',
  CONTACTS: 'gw_contacts',
}

export async function createIdentity(name: string): Promise<MyProfile> {
  const profile: MyProfile = {
    deviceId: generateDeviceId(),
    name,
    sharedKey: generateSharedKey(),
    createdAt: Date.now(),
  }
  await SecureStore.setItemAsync(KEYS.PROFILE, JSON.stringify(profile))
  return profile
}

export async function getProfile(): Promise<MyProfile | null> {
  const raw = await SecureStore.getItemAsync(KEYS.PROFILE)
  if (!raw) return null
  return JSON.parse(raw)
}

export async function updateProfileName(name: string): Promise<void> {
  const profile = await getProfile()
  if (!profile) throw new Error('No profile')
  profile.name = name
  await SecureStore.setItemAsync(KEYS.PROFILE, JSON.stringify(profile))
}

export async function deleteIdentity(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.PROFILE)
  await SecureStore.deleteItemAsync(KEYS.CONTACTS)
}

export async function getContacts(): Promise<Contact[]> {
  const raw = await SecureStore.getItemAsync(KEYS.CONTACTS)
  if (!raw) return []
  return JSON.parse(raw)
}

export async function addContact(contact: Contact): Promise<void> {
  const contacts = await getContacts()
  const existing = contacts.findIndex(c => c.deviceId === contact.deviceId)
  if (existing >= 0) contacts[existing] = contact
  else contacts.push(contact)
  await SecureStore.setItemAsync(KEYS.CONTACTS, JSON.stringify(contacts))
}

export async function getContact(deviceId: string): Promise<Contact | null> {
  const contacts = await getContacts()
  return contacts.find(c => c.deviceId === deviceId) ?? null
}

export async function renameContact(deviceId: string, name: string): Promise<void> {
  const contacts = await getContacts()
  const c = contacts.find(c => c.deviceId === deviceId)
  if (!c) throw new Error('Contact not found')
  c.name = name
  await SecureStore.setItemAsync(KEYS.CONTACTS, JSON.stringify(contacts))
}

export async function deleteContact(deviceId: string): Promise<void> {
  const contacts = await getContacts()
  await SecureStore.setItemAsync(
    KEYS.CONTACTS,
    JSON.stringify(contacts.filter(c => c.deviceId !== deviceId))
  )
}

// ─── QR Payload ───────────────────────────────────────────────────
// QR contains deviceId + sharedKey
// Anyone who scans gets the key to encrypt messages to you

export interface QRPayload {
  deviceId: string
  sharedKey: string
  v: number
}

export function buildQRPayload(profile: MyProfile): string {
  return JSON.stringify({
    deviceId: profile.deviceId,
    sharedKey: profile.sharedKey,
    v: 1,
  })
}

export function parseQRPayload(raw: string): QRPayload | null {
  try {
    const p = JSON.parse(raw)
    if (!p.deviceId || !p.sharedKey) return null
    return p
  } catch { return null }
}
