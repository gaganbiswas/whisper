import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { fromByteArray } from "base64-js";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import ax from "../axios";
import { decodeBase64, STORAGE_KEYS } from "../utils";

const ONE_TIME_PREKEY_TARGET = 100;
const ONE_TIME_PREKEY_MIN = 20;
const dbPromise = SQLite.openDatabaseAsync("prekeys.db");

let replenishing: Promise<void> | null = null;

async function initPrekeyStore() {
  const db = await dbPromise;
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS one_time_prekeys_local (
      id TEXT PRIMARY KEY,
      private_key TEXT NOT NULL
    );
  `);
}

async function generateOneTimePrekeys(count: number) {
  await initPrekeyStore();
  const db = await dbPromise;
  const oneTimePrekeys: { id: string; key: string }[] = [];

  await db.withTransactionAsync(async () => {
    for (let i = 0; i < count; i++) {
      const privateKey = x25519.utils.randomSecretKey();
      const id = Crypto.randomUUID();

      await db.runAsync(
        `INSERT INTO one_time_prekeys_local (id, private_key) VALUES (?, ?)`,
        id,
        fromByteArray(privateKey),
      );
      oneTimePrekeys.push({
        id,
        key: fromByteArray(x25519.getPublicKey(privateKey)),
      });
    }
  });

  return oneTimePrekeys;
}

export async function generateAndUploadPrekeys(identityPrivateKey: Uint8Array) {
  const signedPrekeyPrivate = x25519.utils.randomSecretKey();
  const signedPrekeyPublic = x25519.getPublicKey(signedPrekeyPrivate);
  const signature = ed25519.sign(signedPrekeyPublic, identityPrivateKey);

  await SecureStore.setItemAsync(
    STORAGE_KEYS.signedPrekey,
    fromByteArray(signedPrekeyPrivate),
  );

  await ax.post("/prekeys", {
    signedPrekey: {
      key: fromByteArray(signedPrekeyPublic),
      signature: fromByteArray(signature),
    },
    oneTimePrekeys: await generateOneTimePrekeys(ONE_TIME_PREKEY_TARGET),
  });
}

export function replenishOneTimePrekeys(): Promise<void> {
  if (!replenishing) {
    replenishing = (async () => {
      const { data } = await ax.get<{ count: number }>("/prekeys/count");
      if (data.count >= ONE_TIME_PREKEY_MIN) return;
      await ax.post("/prekeys", {
        oneTimePrekeys: await generateOneTimePrekeys(
          ONE_TIME_PREKEY_TARGET - data.count,
        ),
      });
    })().finally(() => {
      replenishing = null;
    });
  }
  return replenishing;
}

export async function consumeLocalOneTimePrekey(
  id: string,
): Promise<Uint8Array | null> {
  const db = await dbPromise;
  const row = await db.getFirstAsync<{ private_key: string }>(
    `SELECT private_key FROM one_time_prekeys_local WHERE id = ?`,
    id,
  );
  if (!row) return null;
  await db.runAsync(`DELETE FROM one_time_prekeys_local WHERE id = ?`, id);
  return decodeBase64(row.private_key);
}

export async function getSignedPrekeyPrivate(): Promise<Uint8Array> {
  const stored = await SecureStore.getItemAsync(STORAGE_KEYS.signedPrekey);
  if (!stored) {
    throw new Error(
      "No signed prekey found — did you call generateAndUploadPrekeys?",
    );
  }
  return decodeBase64(stored);
}
