/**
 * Ghostwire Crypto - Pure JS AES-256-CTR via aes-js
 * No native modules needed, works on all Android versions
 */
import * as ExpoCrypto from 'expo-crypto'
import * as aesjs from 'aes-js'

// Generate 32-byte hex key
export function generateSharedKey(): string {
  const bytes = ExpoCrypto.getRandomBytes(32)
  return aesjs.utils.hex.fromBytes(bytes)
}

export function generateDeviceId(): string {
  const bytes = ExpoCrypto.getRandomBytes(8)
  return aesjs.utils.hex.fromBytes(bytes).toUpperCase()
}

export async function encryptMessage(key: string, plaintext: string): Promise<string> {
  const keyBytes = aesjs.utils.hex.toBytes(key)
  const textBytes = aesjs.utils.utf8.toBytes(plaintext)
  const iv = ExpoCrypto.getRandomBytes(16)
  const aesCtr = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(iv))
  const encrypted = aesCtr.encrypt(textBytes)
  // Pack: iv(16) + encrypted
  const combined = new Uint8Array(16 + encrypted.length)
  combined.set(iv)
  combined.set(encrypted, 16)
  return aesjs.utils.hex.fromBytes(combined)
}

export async function decryptMessage(key: string, packed: string): Promise<string> {
  const keyBytes = aesjs.utils.hex.toBytes(key)
  const combined = aesjs.utils.hex.toBytes(packed)
  const iv = combined.slice(0, 16)
  const encrypted = combined.slice(16)
  const aesCtr = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(iv))
  const decrypted = aesCtr.decrypt(encrypted)
  return aesjs.utils.utf8.fromBytes(decrypted)
}

export async function generateFingerprint(keyA: string, keyB: string): Promise<string> {
  const input = [keyA, keyB].sort().join('|')
  const hash = await ExpoCrypto.digestStringAsync(
    ExpoCrypto.CryptoDigestAlgorithm.SHA256,
    input,
    { encoding: ExpoCrypto.CryptoEncoding.HEX }
  )
  return hash.slice(0, 16).toUpperCase().match(/.{4}/g)!.join(' ')
}
