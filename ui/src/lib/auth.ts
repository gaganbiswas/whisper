import * as SecureStore from "expo-secure-store";
import { STORAGE_KEYS } from "./utils";

export async function saveMyUserId(userId: number) {
  await SecureStore.setItemAsync(STORAGE_KEYS.userId, String(userId));
}

export async function getMyUserId(): Promise<number> {
  const stored = await SecureStore.getItemAsync(STORAGE_KEYS.userId);
  if (!stored) throw new Error("No logged-in user found");
  return Number(stored);
}
