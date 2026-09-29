import * as SQLite from "expo-sqlite";

export type MessageStatus = "pending" | "sent" | "delivered" | "seen";

export type ChatMessage = {
  id: string;
  from_user: number;
  to_user: number;
  text: string;
  ts: number;
  status: MessageStatus;
};

export type Conversation = {
  peer_id: number;
  created_at: number;
  last_message: string | null;
};

const dbPromise = SQLite.openDatabaseAsync("chat.db");

// Statuses only move forward
const STATUS_RANK = `CASE status
  WHEN 'pending' THEN 0 WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'seen' THEN 3
END`;
const RANKS: Record<MessageStatus, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  seen: 3,
};

function placeholders(values: unknown[]) {
  return values.map(() => "?").join(", ");
}

export async function initLocalDb() {
  const db = await dbPromise;
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      from_user INTEGER NOT NULL,
      to_user INTEGER NOT NULL,
      text TEXT NOT NULL,
      ts INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent'
    );
    CREATE TABLE IF NOT EXISTS conversations (
      peer_id INTEGER PRIMARY KEY,
      created_at INTEGER NOT NULL
    );
  `);

  const columns = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(messages)`,
  );
  if (!columns.some((column) => column.name === "status")) {
    await db.execAsync(
      `ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'sent'`,
    );
  }
}

export async function clearLocalChatData() {
  await initLocalDb();
  const db = await dbPromise;
  await db.execAsync(`
    DELETE FROM messages;
    DELETE FROM conversations;
  `);
}

export async function saveConversation(peerId: number) {
  const db = await dbPromise;
  await db.runAsync(
    `INSERT OR IGNORE INTO conversations (peer_id, created_at) VALUES (?, ?)`,
    peerId,
    Date.now(),
  );
}

export async function getConversations() {
  const db = await dbPromise;
  return db.getAllAsync<Conversation>(
    `SELECT c.peer_id, c.created_at,
       (SELECT text FROM messages m
        WHERE m.from_user = c.peer_id OR m.to_user = c.peer_id
        ORDER BY m.ts DESC LIMIT 1) AS last_message
     FROM conversations c
     ORDER BY c.created_at DESC`,
  );
}

export async function hasMessage(id: string) {
  const db = await dbPromise;
  return !!(await db.getFirstAsync(`SELECT 1 FROM messages WHERE id = ?`, id));
}

export async function saveMessage(message: ChatMessage) {
  const db = await dbPromise;
  await db.runAsync(
    `INSERT OR IGNORE INTO messages (id, from_user, to_user, text, ts, status) VALUES (?, ?, ?, ?, ?, ?)`,
    message.id,
    message.from_user,
    message.to_user,
    message.text,
    message.ts,
    message.status,
  );
}

export async function getPendingMessages(myUserId: number) {
  const db = await dbPromise;
  return db.getAllAsync<ChatMessage>(
    `SELECT * FROM messages WHERE from_user = ? AND status = 'pending' ORDER BY ts ASC`,
    myUserId,
  );
}

export async function getUnseenMessageIds(myUserId: number, peerId: number) {
  const db = await dbPromise;
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM messages WHERE from_user = ? AND to_user = ? AND status != 'seen'`,
    peerId,
    myUserId,
  );
  return rows.map((row) => row.id);
}

/**
 * Moves messages forward to `status`. Pass `toUser` when applying a receipt so
 * that only the actual recipient of a message can mark it delivered or seen.
 * Returns whether any row changed.
 */
export async function advanceMessageStatus(
  ids: string[],
  status: MessageStatus,
  toUser?: number,
) {
  if (!ids.length) return false;
  const db = await dbPromise;
  const recipientFilter = toUser === undefined ? "" : "AND to_user = ?";
  const params = toUser === undefined ? ids : [...ids, toUser];
  const result = await db.runAsync(
    `UPDATE messages SET status = ?
     WHERE id IN (${placeholders(ids)}) ${recipientFilter} AND ${STATUS_RANK} < ?`,
    status,
    ...params,
    RANKS[status],
  );
  return result.changes > 0;
}

export async function getMessagesWith(myUserId: number, peerId: number) {
  const db = await dbPromise;
  return db.getAllAsync<ChatMessage>(
    `SELECT * FROM messages
     WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)
     ORDER BY ts ASC`,
    myUserId,
    peerId,
    peerId,
    myUserId,
  );
}
