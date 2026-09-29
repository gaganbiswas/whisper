import { Dexie, type Table } from "dexie";
import type { RatchetState } from "./double-rachet";

const db = new Dexie("session") as Dexie & {
  sessions: Table<RatchetState, string>;
};

db.version(1).stores({ sessions: "" });

export async function initSessionStore() {
  await db.open();
}

export async function clearSessions() {
  await db.sessions.clear();
}

export async function saveSession(remoteDeviceId: string, state: RatchetState) {
  await db.sessions.put(state, remoteDeviceId);
}

export async function loadSession(
  remoteDeviceId: string,
): Promise<RatchetState | null> {
  return (await db.sessions.get(remoteDeviceId)) ?? null;
}
