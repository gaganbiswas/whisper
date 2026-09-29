import { Dexie, type EntityTable } from "dexie";
import type { ChatMessage, Conversation, MessageStatus } from "./init";

export type { ChatMessage, Conversation, MessageStatus } from "./init";

type StoredConversation = Omit<Conversation, "last_message">;

const db = new Dexie("chat") as Dexie & {
  messages: EntityTable<ChatMessage, "id">;
  conversations: EntityTable<StoredConversation, "peer_id">;
};

db.version(1).stores({
  messages:
    "id, [from_user+to_user], [from_user+status], [from_user+ts], [to_user+ts]",
  conversations: "peer_id, created_at",
});

// Statuses only move forward
const RANKS: Record<MessageStatus, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  seen: 3,
};

export async function initLocalDb() {
  await db.open();
}

export async function clearLocalChatData() {
  await db.transaction("rw", db.messages, db.conversations, async () => {
    await Promise.all([db.messages.clear(), db.conversations.clear()]);
  });
}

export async function saveConversation(peerId: number) {
  await db.transaction("rw", db.conversations, async () => {
    if (await db.conversations.get(peerId)) return;
    await db.conversations.add({ peer_id: peerId, created_at: Date.now() });
  });
}

async function getLastMessageWith(peerId: number) {
  const range = (index: string) =>
    db.messages
      .where(index)
      .between([peerId, Dexie.minKey], [peerId, Dexie.maxKey])
      .last();
  const [sent, received] = await Promise.all([
    range("[to_user+ts]"),
    range("[from_user+ts]"),
  ]);
  if (!sent || !received) return sent ?? received;
  return sent.ts > received.ts ? sent : received;
}

export async function getConversations(): Promise<Conversation[]> {
  const conversations = await db.conversations
    .orderBy("created_at")
    .reverse()
    .toArray();
  return Promise.all(
    conversations.map(async (conversation) => ({
      ...conversation,
      last_message:
        (await getLastMessageWith(conversation.peer_id))?.text ?? null,
    })),
  );
}

export async function hasMessage(id: string) {
  return !!(await db.messages.get(id));
}

export async function saveMessage(message: ChatMessage) {
  await db.transaction("rw", db.messages, async () => {
    if (await db.messages.get(message.id)) return;
    await db.messages.add(message);
  });
}

export async function getPendingMessages(myUserId: number) {
  return db.messages
    .where("[from_user+status]")
    .equals([myUserId, "pending"])
    .sortBy("ts");
}

export async function getUnseenMessageIds(myUserId: number, peerId: number) {
  const rows = await db.messages
    .where("[from_user+to_user]")
    .equals([peerId, myUserId])
    .filter((message) => message.status !== "seen")
    .toArray();
  return rows.map((row) => row.id);
}

export async function advanceMessageStatus(
  ids: string[],
  status: MessageStatus,
  toUser?: number,
) {
  if (!ids.length) return false;
  const changes = await db.messages
    .where("id")
    .anyOf(ids)
    .filter(
      (message) =>
        (toUser === undefined || message.to_user === toUser) &&
        RANKS[message.status] < RANKS[status],
    )
    .modify({ status });
  return changes > 0;
}

export async function getMessagesWith(myUserId: number, peerId: number) {
  return db.messages
    .where("[from_user+to_user]")
    .anyOf([
      [myUserId, peerId],
      [peerId, myUserId],
    ])
    .sortBy("ts");
}
