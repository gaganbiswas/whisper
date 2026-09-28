import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { toByteArray } from "base64-js";

export const STORAGE_KEYS = {
  identityKey: "pingme_id_key",
  token: "pingme_auth_token",
  deviceId: "dv_id",
  userId: "user_id",
  signedPrekey: "pingme_signed_pvt_prekey",
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
  let deviceId = await SecureStore.getItemAsync(STORAGE_KEYS.deviceId);

  if (!deviceId) {
    deviceId = Crypto.randomUUID();
    await SecureStore.setItemAsync(STORAGE_KEYS.deviceId, deviceId);
  }

  return deviceId;
}
