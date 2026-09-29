import storage from "./storage";
import { STORAGE_KEYS } from "./utils";

export async function saveMyUserId(userId: number) {
  await storage.setItem(STORAGE_KEYS.userId, String(userId));
}

export async function getMyUserId(): Promise<number> {
  const stored = await storage.getItem(STORAGE_KEYS.userId);
  if (!stored) throw new Error("No logged-in user found");
  return Number(stored);
}
