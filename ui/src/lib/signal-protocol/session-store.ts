import * as SQLite from "expo-sqlite";
import { fromByteArray } from "base64-js";
import { decodeBase64 } from "../utils";
import type { RatchetState } from "./double-rachet";

const dbPromise = SQLite.openDatabaseAsync("session.db");
const SESSION_SCHEMA_VERSION = 2;

export async function initSessionStore() {
  const db = await dbPromise;
  const version = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  if ((version?.user_version ?? 0) < SESSION_SCHEMA_VERSION) {
    await db.execAsync("DROP TABLE IF EXISTS ratchet_sessions");
  }
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ratchet_sessions (
      remote_device_id TEXT PRIMARY KEY,
      state TEXT NOT NULL
    );
    PRAGMA user_version = ${SESSION_SCHEMA_VERSION};
  `);
}

export async function clearSessions() {
  await initSessionStore();
  const db = await dbPromise;
  await db.execAsync("DELETE FROM ratchet_sessions");
}

function serialize(state: RatchetState): string {
  return JSON.stringify({
    dhSelfPriv: fromByteArray(state.dhSelfPriv),
    dhSelfPub: fromByteArray(state.dhSelfPub),
    dhRemotePub: state.dhRemotePub ? fromByteArray(state.dhRemotePub) : null,
    rootKey: fromByteArray(state.rootKey),
    chainKeySend: state.chainKeySend ? fromByteArray(state.chainKeySend) : null,
    chainKeyRecv: state.chainKeyRecv ? fromByteArray(state.chainKeyRecv) : null,
    sendN: state.sendN,
    recvN: state.recvN,
    previousChainLength: state.previousChainLength,
    skippedKeys: Array.from(state.skippedKeys.entries()).map(([k, v]) => [
      k,
      fromByteArray(v),
    ]),
  });
}

function deserialize(json: string): RatchetState {
  const raw = JSON.parse(json);
  return {
    dhSelfPriv: decodeBase64(raw.dhSelfPriv),
    dhSelfPub: decodeBase64(raw.dhSelfPub),
    dhRemotePub: raw.dhRemotePub ? decodeBase64(raw.dhRemotePub) : null,
    rootKey: decodeBase64(raw.rootKey),
    chainKeySend: raw.chainKeySend ? decodeBase64(raw.chainKeySend) : null,
    chainKeyRecv: raw.chainKeyRecv ? decodeBase64(raw.chainKeyRecv) : null,
    sendN: raw.sendN,
    recvN: raw.recvN,
    previousChainLength: raw.previousChainLength,
    skippedKeys: new Map(
      raw.skippedKeys.map(([k, v]: [string, string]) => [k, decodeBase64(v)]),
    ),
  };
}

export async function saveSession(remoteDeviceId: string, state: RatchetState) {
  const db = await dbPromise;
  await db.runAsync(
    `INSERT INTO ratchet_sessions (remote_device_id, state) VALUES (?, ?)
     ON CONFLICT(remote_device_id) DO UPDATE SET state = excluded.state`,
    remoteDeviceId,
    serialize(state),
  );
}

export async function loadSession(
  remoteDeviceId: string,
): Promise<RatchetState | null> {
  const db = await dbPromise;
  const row = await db.getFirstAsync<{ state: string }>(
    `SELECT state FROM ratchet_sessions WHERE remote_device_id = ?`,
    remoteDeviceId,
  );
  return row ? deserialize(row.state) : null;
}
