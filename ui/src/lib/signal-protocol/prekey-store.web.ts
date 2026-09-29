import { Dexie, type EntityTable } from "dexie";
import type { StoredPrekey } from "./prekey-store";

export type { StoredPrekey } from "./prekey-store";

const db = new Dexie("prekeys") as Dexie & {
  oneTimePrekeys: EntityTable<StoredPrekey, "id">;
};

db.version(1).stores({ oneTimePrekeys: "id" });

export async function saveOneTimePrekeys(prekeys: StoredPrekey[]) {
  await db.oneTimePrekeys.bulkAdd(prekeys);
}

export async function takeOneTimePrekey(id: string): Promise<string | null> {
  return db.transaction("rw", db.oneTimePrekeys, async () => {
    const prekey = await db.oneTimePrekeys.get(id);
    if (!prekey) return null;
    await db.oneTimePrekeys.delete(id);
    return prekey.privateKey;
  });
}
