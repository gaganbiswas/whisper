import * as Crypto from "expo-crypto";
import { toByteArray } from "base64-js";
import storage from "./storage";

export const STORAGE_KEYS = {
  identityKey: "whisper_id_key",
  token: "whisper_auth_token",
  deviceId: "dv_id",
  userId: "user_id",
  signedPrekey: "whisper_signed_pvt_prekey",
} as const;

export function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  if (normalized.length % 4 === 1) {
    throw new Error("Invalid base64 value");
  }
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return toByteArray(padded);
}

export async function getDeviceId(): Promise<string> {
  let deviceId = await storage.getItem(STORAGE_KEYS.deviceId);

  if (!deviceId) {
    deviceId = Crypto.randomUUID();
    await storage.setItem(STORAGE_KEYS.deviceId, deviceId);
  }

  return deviceId;
}
