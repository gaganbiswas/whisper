import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { fromByteArray } from "base64-js";
import * as Crypto from "expo-crypto";
import ax from "../axios";
import { decodeBase64, STORAGE_KEYS } from "../utils";
import storage from "../storage";
import {
  saveOneTimePrekeys,
  takeOneTimePrekey,
  type StoredPrekey,
} from "./prekey-store";

const ONE_TIME_PREKEY_TARGET = 100;
const ONE_TIME_PREKEY_MIN = 20;

let replenishing: Promise<void> | null = null;

async function generateOneTimePrekeys(count: number) {
  const stored: StoredPrekey[] = [];
  const oneTimePrekeys: { id: string; key: string }[] = [];

  for (let i = 0; i < count; i++) {
    const privateKey = x25519.utils.randomSecretKey();
    const id = Crypto.randomUUID();

    stored.push({ id, privateKey: fromByteArray(privateKey) });
    oneTimePrekeys.push({
      id,
      key: fromByteArray(x25519.getPublicKey(privateKey)),
    });
  }

  await saveOneTimePrekeys(stored);
  return oneTimePrekeys;
}

export async function generateAndUploadPrekeys(identityPrivateKey: Uint8Array) {
  const signedPrekeyPrivate = x25519.utils.randomSecretKey();
  const signedPrekeyPublic = x25519.getPublicKey(signedPrekeyPrivate);
  const signature = ed25519.sign(signedPrekeyPublic, identityPrivateKey);

  await storage.setItem(
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
  const privateKey = await takeOneTimePrekey(id);
  return privateKey ? decodeBase64(privateKey) : null;
}

export async function getSignedPrekeyPrivate(): Promise<Uint8Array> {
  const stored = await storage.getItem(STORAGE_KEYS.signedPrekey);
  if (!stored) {
    throw new Error(
      "No signed prekey found — did you call generateAndUploadPrekeys?",
    );
  }
  return decodeBase64(stored);
}
