import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import {
  randomBytes,
  concatBytes,
  equalBytes,
  utf8ToBytes,
} from "@noble/ciphers/utils.js";
import { fromByteArray } from "base64-js";
import { decodeBase64 } from "../utils";

const MAX_SKIP = 1000;

export type RatchetState = {
  dhSelfPriv: Uint8Array;
  dhSelfPub: Uint8Array;
  dhRemotePub: Uint8Array | null;
  rootKey: Uint8Array;
  chainKeySend: Uint8Array | null;
  chainKeyRecv: Uint8Array | null;
  sendN: number;
  recvN: number;
  previousChainLength: number;
  skippedKeys: Map<string, Uint8Array>;
};

export type RatchetHeader = {
  dhPub: string;
  previousChainLength: number;
  messageNumber: number;
};

function kdfRootKey(
  rootKey: Uint8Array,
  dhOutput: Uint8Array,
): [Uint8Array, Uint8Array] {
  const output = hkdf(
    sha256,
    dhOutput,
    rootKey,
    utf8ToBytes("DoubleRatchetRootKDF"),
    64,
  );
  return [output.subarray(0, 32), output.subarray(32, 64)];
}

function kdfChainKey(chainKey: Uint8Array) {
  return {
    messageKey: hmac(sha256, chainKey, new Uint8Array([0x01])),
    nextChainKey: hmac(sha256, chainKey, new Uint8Array([0x02])),
  };
}

function encryptWithKey(key: Uint8Array, plaintext: string): string {
  const nonce = randomBytes(24);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(
    utf8ToBytes(plaintext),
  );
  return fromByteArray(concatBytes(nonce, ciphertext));
}

function decryptWithKey(key: Uint8Array, payloadB64: string): string {
  const payload = decodeBase64(payloadB64);
  const nonce = payload.subarray(0, 24);
  const ciphertext = payload.subarray(24);
  return new TextDecoder().decode(
    xchacha20poly1305(key, nonce).decrypt(ciphertext),
  );
}

export function initRatchetAlice(
  sharedKey: Uint8Array,
  theirInitialRatchetPublic: Uint8Array,
): RatchetState {
  const dhSelfPriv = x25519.utils.randomSecretKey();
  const [rootKey, chainKeySend] = kdfRootKey(
    sharedKey,
    x25519.getSharedSecret(dhSelfPriv, theirInitialRatchetPublic),
  );

  return {
    dhSelfPriv,
    dhSelfPub: x25519.getPublicKey(dhSelfPriv),
    dhRemotePub: theirInitialRatchetPublic,
    rootKey,
    chainKeySend,
    chainKeyRecv: null,
    sendN: 0,
    recvN: 0,
    previousChainLength: 0,
    skippedKeys: new Map(),
  };
}

export function initRatchetBob(
  sharedKey: Uint8Array,
  mySignedPrekeyPrivate: Uint8Array,
  mySignedPrekeyPublic: Uint8Array,
): RatchetState {
  return {
    dhSelfPriv: mySignedPrekeyPrivate,
    dhSelfPub: mySignedPrekeyPublic,
    dhRemotePub: null,
    rootKey: sharedKey,
    chainKeySend: null,
    chainKeyRecv: null,
    sendN: 0,
    recvN: 0,
    previousChainLength: 0,
    skippedKeys: new Map(),
  };
}

export function ratchetEncrypt(
  state: RatchetState,
  plaintext: string,
): { header: RatchetHeader; payload: string } {
  if (!state.chainKeySend) {
    throw new Error(
      "No sending chain yet — the other side has to message first after accepting a new session.",
    );
  }

  const { messageKey, nextChainKey } = kdfChainKey(state.chainKeySend);
  state.chainKeySend = nextChainKey;

  const header: RatchetHeader = {
    dhPub: fromByteArray(state.dhSelfPub),
    previousChainLength: state.previousChainLength,
    messageNumber: state.sendN,
  };
  state.sendN += 1;

  return { header, payload: encryptWithKey(messageKey, plaintext) };
}

function skipMessageKeys(state: RatchetState, until: number) {
  if (!state.chainKeyRecv || !state.dhRemotePub) return;
  if (until - state.recvN > MAX_SKIP) {
    throw new Error(
      "Too many skipped messages in this chain — refusing to buffer that many keys",
    );
  }
  const remote = fromByteArray(state.dhRemotePub);
  while (state.recvN < until) {
    const { messageKey, nextChainKey } = kdfChainKey(state.chainKeyRecv);
    state.skippedKeys.set(`${remote}:${state.recvN}`, messageKey);
    state.chainKeyRecv = nextChainKey;
    state.recvN += 1;
  }
}

function dhRatchetStep(state: RatchetState, theirNewDhPub: Uint8Array) {
  state.previousChainLength = state.sendN;
  state.sendN = 0;
  state.recvN = 0;
  state.dhRemotePub = theirNewDhPub;

  [state.rootKey, state.chainKeyRecv] = kdfRootKey(
    state.rootKey,
    x25519.getSharedSecret(state.dhSelfPriv, theirNewDhPub),
  );

  state.dhSelfPriv = x25519.utils.randomSecretKey();
  state.dhSelfPub = x25519.getPublicKey(state.dhSelfPriv);

  [state.rootKey, state.chainKeySend] = kdfRootKey(
    state.rootKey,
    x25519.getSharedSecret(state.dhSelfPriv, theirNewDhPub),
  );
}

export function ratchetDecrypt(
  state: RatchetState,
  header: RatchetHeader,
  payloadB64: string,
): string {
  const cacheKey = `${header.dhPub}:${header.messageNumber}`;
  const cached = state.skippedKeys.get(cacheKey);
  if (cached) {
    state.skippedKeys.delete(cacheKey);
    return decryptWithKey(cached, payloadB64);
  }

  const theirDhPub = decodeBase64(header.dhPub);
  const isNewRatchetKey =
    !state.dhRemotePub || !equalBytes(state.dhRemotePub, theirDhPub);

  if (!isNewRatchetKey && header.messageNumber < state.recvN) {
    throw new Error(
      `Duplicate message ${header.messageNumber} (chain already at ${state.recvN})`,
    );
  }

  if (isNewRatchetKey) {
    skipMessageKeys(state, header.previousChainLength);
    dhRatchetStep(state, theirDhPub);
  }

  skipMessageKeys(state, header.messageNumber);

  const { messageKey, nextChainKey } = kdfChainKey(state.chainKeyRecv!);
  state.chainKeyRecv = nextChainKey;
  state.recvN += 1;

  return decryptWithKey(messageKey, payloadB64);
}
