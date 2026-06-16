/**
 * Ghostwire Database Service
 * Encrypted SQLite via expo-sqlite
 * Messages encrypted with AES-256-GCM before storage
 * Wipe = delete rows (encrypted blobs are useless without session key anyway)
 */

import * as SQLite from 'expo-sqlite'
import { encryptMessage, decryptMessage } from './crypto'

// ─── Types ────────────────────────────────────────────────────────

export interface Message {
  id: string
  contactId: string
  content: string       // plaintext (decrypted on read)
  timestamp: number
  direction: 'sent' | 'received'
  status: 'sending' | 'delivered' | 'failed'
}

interface RawMessage {
  id: string
  contact_id: string
  content_encrypted: string
  timestamp: number
  direction: string
  status: string
}

// ─── DB Instance ──────────────────────────────────────────────────

let db: SQLite.SQLiteDatabase | null = null

export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync('ghostwire.db')
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      content_encrypted TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      direction TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'delivered'
    );
    CREATE INDEX IF NOT EXISTS idx_contact_time 
      ON messages(contact_id, timestamp);
  `)
}

function getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Database not initialized')
  return db
}

// ─── Messages ─────────────────────────────────────────────────────

export async function saveMessage(
  message: Omit<Message, 'content'> & { content: string },
  sessionKey: CryptoKey
): Promise<void> {
  const encrypted = await encryptMessage(sessionKey, message.content)
  const database = getDb()
  await database.runAsync(
    `INSERT OR REPLACE INTO messages 
      (id, contact_id, content_encrypted, timestamp, direction, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      message.id,
      message.contactId,
      encrypted,
      message.timestamp,
      message.direction,
      message.status,
    ]
  )
}

export async function getMessages(
  contactId: string,
  sessionKey: CryptoKey,
  limit = 100
): Promise<Message[]> {
  const database = getDb()
  const rows = await database.getAllAsync<RawMessage>(
    `SELECT * FROM messages 
     WHERE contact_id = ? 
     ORDER BY timestamp DESC 
     LIMIT ?`,
    [contactId, limit]
  )

  const messages: Message[] = []
  for (const row of rows.reverse()) {
    try {
      const content = await decryptMessage(sessionKey, row.content_encrypted)
      messages.push({
        id: row.id,
        contactId: row.contact_id,
        content,
        timestamp: row.timestamp,
        direction: row.direction as 'sent' | 'received',
        status: row.status as Message['status'],
      })
    } catch {
      // Skip undecryptable messages (from old sessions with different key)
    }
  }
  return messages
}

export async function updateMessageStatus(
  id: string,
  status: Message['status']
): Promise<void> {
  await getDb().runAsync(
    'UPDATE messages SET status = ? WHERE id = ?',
    [status, id]
  )
}

// ─── Wipe ─────────────────────────────────────────────────────────

export async function wipeContactMessages(contactId: string): Promise<void> {
  await getDb().runAsync(
    'DELETE FROM messages WHERE contact_id = ?',
    [contactId]
  )
}

export async function wipeAllMessages(): Promise<void> {
  await getDb().runAsync('DELETE FROM messages')
}

// ─── Chat Preview (for contact list) ─────────────────────────────

export interface ChatPreview {
  contactId: string
  lastMessageEncrypted: string
  lastTimestamp: number
  unreadCount: number
}

export async function getChatPreviews(): Promise<ChatPreview[]> {
  const database = getDb()
  const rows = await database.getAllAsync<{
    contact_id: string
    content_encrypted: string
    timestamp: number
    unread: number
  }>(`
    SELECT 
      contact_id,
      content_encrypted,
      timestamp,
      (SELECT COUNT(*) FROM messages m2 
       WHERE m2.contact_id = m.contact_id 
       AND m2.direction = 'received') as unread
    FROM messages m
    WHERE timestamp = (
      SELECT MAX(timestamp) FROM messages m3 
      WHERE m3.contact_id = m.contact_id
    )
    GROUP BY contact_id
    ORDER BY timestamp DESC
  `)

  return rows.map((r) => ({
    contactId: r.contact_id,
    lastMessageEncrypted: r.content_encrypted,
    lastTimestamp: r.timestamp,
    unreadCount: r.unread,
  }))
}
