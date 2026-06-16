/**
 * Ghostwire Identity Service
 * Manages long-term identity: keypair, deviceID, profile, contacts
 * All stored in expo-secure-store (OS-encrypted, survives app kills)
 */

import * as SecureStore from 'expo-secure-store'
import {
  generateKeyPair,
  exportPublicKey,
  exportPrivateKey,
  importPublicKey,
  importPrivateKey,
  generateDeviceId,
} from './crypto'

// ─── Types ────────────────────────────────────────────────────────

export interface Contact {
  deviceId: string
  publicKeyJwk: JsonWebKey
  name: string
  addedAt: number
}

export interface MyProfile {
  deviceId: string
  name: string
  publicKeyJwk: JsonWebKey
  privateKeyJwk: JsonWebKey
  createdAt: number
}

// ─── Keys ─────────────────────────────────────────────────────────

const KEYS = {
  PROFILE: 'gw_profile',
  CONTACTS: 'gw_contacts',
}

// ─── Profile ──────────────────────────────────────────────────────

export async function createIdentity(name: string): Promise<MyProfile> {
  const keypair = await generateKeyPair()
  const publicKeyJwk = await exportPublicKey(keypair.publicKey)
  const privateKeyJwk = await exportPrivateKey(keypair.privateKey)
  const deviceId = generateDeviceId()

  const profile: MyProfile = {
    deviceId,
    name,
    publicKeyJwk,
    privateKeyJwk,
    createdAt: Date.now(),
  }

  await SecureStore.setItemAsync(KEYS.PROFILE, JSON.stringify(profile))
  return profile
}

export async function getProfile(): Promise<MyProfile | null> {
  const raw = await SecureStore.getItemAsync(KEYS.PROFILE)
  if (!raw) return null
  return JSON.parse(raw) as MyProfile
}

export async function updateProfileName(name: string): Promise<void> {
  const profile = await getProfile()
  if (!profile) throw new Error('No profile found')
  profile.name = name
  await SecureStore.setItemAsync(KEYS.PROFILE, JSON.stringify(profile))
}

export async function deleteIdentity(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.PROFILE)
  await SecureStore.deleteItemAsync(KEYS.CONTACTS)
}

// ─── Contacts ─────────────────────────────────────────────────────

export async function getContacts(): Promise<Contact[]> {
  const raw = await SecureStore.getItemAsync(KEYS.CONTACTS)
  if (!raw) return []
  return JSON.parse(raw) as Contact[]
}

export async function addContact(contact: Contact): Promise<void> {
  const contacts = await getContacts()
  const existing = contacts.findIndex((c) => c.deviceId === contact.deviceId)
  if (existing >= 0) {
    contacts[existing] = contact // update if already exists
  } else {
    contacts.push(contact)
  }
  await SecureStore.setItemAsync(KEYS.CONTACTS, JSON.stringify(contacts))
}

export async function getContact(deviceId: string): Promise<Contact | null> {
  const contacts = await getContacts()
  return contacts.find((c) => c.deviceId === deviceId) ?? null
}

export async function renameContact(deviceId: string, name: string): Promise<void> {
  const contacts = await getContacts()
  const contact = contacts.find((c) => c.deviceId === deviceId)
  if (!contact) throw new Error('Contact not found')
  contact.name = name
  await SecureStore.setItemAsync(KEYS.CONTACTS, JSON.stringify(contacts))
}

export async function deleteContact(deviceId: string): Promise<void> {
  const contacts = await getContacts()
  const filtered = contacts.filter((c) => c.deviceId !== deviceId)
  await SecureStore.setItemAsync(KEYS.CONTACTS, JSON.stringify(filtered))
}

// ─── QR Payload ───────────────────────────────────────────────────

export interface QRPayload {
  deviceId: string
  publicKeyJwk: JsonWebKey
  v: number // version
}

export function buildQRPayload(profile: MyProfile): string {
  const payload: QRPayload = {
    deviceId: profile.deviceId,
    publicKeyJwk: profile.publicKeyJwk,
    v: 1,
  }
  return JSON.stringify(payload)
}

export function parseQRPayload(raw: string): QRPayload | null {
  try {
    const parsed = JSON.parse(raw) as QRPayload
    if (!parsed.deviceId || !parsed.publicKeyJwk || !parsed.v) return null
    return parsed
  } catch {
    return null
  }
}

// ─── Crypto Keys from Profile ─────────────────────────────────────

export async function getMyPrivateKey() {
  const profile = await getProfile()
  if (!profile) throw new Error('No profile')
  return importPrivateKey(profile.privateKeyJwk)
}

export async function getMyPublicKey() {
  const profile = await getProfile()
  if (!profile) throw new Error('No profile')
  return importPublicKey(profile.publicKeyJwk)
}

export async function getContactPublicKey(deviceId: string) {
  const contact = await getContact(deviceId)
  if (!contact) throw new Error('Contact not found')
  return importPublicKey(contact.publicKeyJwk)
}
