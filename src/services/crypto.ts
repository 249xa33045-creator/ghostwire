/**
 * Ghostwire Crypto Service
 * ECDH P-256 key exchange + AES-256-GCM encryption
 * Keys stored in SecureStore, never in RAM long-term
 */

import * as Crypto from 'expo-crypto'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// ─── Key Generation ───────────────────────────────────────────────

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  )
}

export async function exportPublicKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key)
}

export async function exportPrivateKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key)
}

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )
}

export async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  )
}

// ─── Shared Secret ────────────────────────────────────────────────

/**
 * Derive shared AES-256-GCM key from ECDH.
 * Same inputs always produce same key → no need to store session key.
 * Re-derive any time from SecureStore keypair + contact's public key.
 */
export async function deriveSharedSecret(
  myPrivateKey: CryptoKey,
  contactPublicKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: contactPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// ─── Message Encryption ───────────────────────────────────────────

export async function encryptMessage(
  key: CryptoKey,
  plaintext: string
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  )
  // Pack: iv(12) + ciphertext → base64
  const combined = new Uint8Array(12 + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), 12)
  return btoa(String.fromCharCode(...combined))
}

export async function decryptMessage(
  key: CryptoKey,
  packed: string
): Promise<string> {
  const binary = atob(packed)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const iv = bytes.slice(0, 12)
  const ciphertext = bytes.slice(12).buffer
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return decoder.decode(decrypted)
}

// ─── Fingerprint ──────────────────────────────────────────────────

/**
 * Generate MITM-detection fingerprint.
 * Both sides compute same value → user compares verbally.
 */
export async function generateFingerprint(
  myPublicKeyJwk: JsonWebKey,
  contactPublicKeyJwk: JsonWebKey
): Promise<string> {
  const keys = [
    JSON.stringify(myPublicKeyJwk),
    JSON.stringify(contactPublicKeyJwk),
  ].sort()
  const data = encoder.encode(keys.join('|'))
  const hash = await crypto.subtle.digest('SHA-256', data)
  const arr = new Uint8Array(hash)
  return Array.from(arr.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
    .match(/.{4}/g)!
    .join(' ')
}

// ─── Device ID ────────────────────────────────────────────────────

export function generateDeviceId(): string {
  const arr = new Uint8Array(8)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}
