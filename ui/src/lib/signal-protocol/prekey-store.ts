import * as SQLite from "expo-sqlite";

export type StoredPrekey = { id: string; privateKey: string };

const dbPromise = SQLite.openDatabaseAsync("prekeys.db");

async function initPrekeyStore() {
  const db = await dbPromise;
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS one_time_prekeys_local (
      id TEXT PRIMARY KEY,
      private_key TEXT NOT NULL
    );
  `);
}

export async function saveOneTimePrekeys(prekeys: StoredPrekey[]) {
  await initPrekeyStore();
  const db = await dbPromise;
  await db.withTransactionAsync(async () => {
    for (const { id, privateKey } of prekeys) {
      await db.runAsync(
        `INSERT INTO one_time_prekeys_local (id, private_key) VALUES (?, ?)`,
        id,
        privateKey,
      );
    }
  });
}

/** Returns the stored private key for `id` and deletes it, or null if unknown. */
export async function takeOneTimePrekey(id: string): Promise<string | null> {
  const db = await dbPromise;
  const row = await db.getFirstAsync<{ private_key: string }>(
    `SELECT private_key FROM one_time_prekeys_local WHERE id = ?`,
    id,
  );
  if (!row) return null;
  await db.runAsync(`DELETE FROM one_time_prekeys_local WHERE id = ?`, id);
  return row.private_key;
}
