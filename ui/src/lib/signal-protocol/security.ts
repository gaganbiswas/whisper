import { ed25519 } from "@noble/curves/ed25519.js";
import { fromByteArray } from "base64-js";
import { decodeBase64, STORAGE_KEYS } from "../utils";
import storage from "../storage";

export const generateSecurityPairs = () => {
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(privateKey);

  return {
    privateKeyBase64: fromByteArray(privateKey),
    publicKeyBase64: fromByteArray(publicKey),
  };
};

export async function getIdentityPrivateKey(): Promise<Uint8Array> {
  const stored = await storage.getItem(STORAGE_KEYS.identityKey);
  if (!stored) throw new Error("No identity key found");
  return decodeBase64(stored);
}
