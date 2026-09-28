import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { fromByteArray } from "base64-js";
import { decodeBase64 } from "../utils";

export type DeviceBundle = {
  deviceId: string;
  identityKey: string;
  signedPrekey: string;
  signedPrekeySignature: string;
  oneTimePrekey: { id: string; key: string } | null;
};

export type X3dhHeader = {
  ephemeralPublicKey: string;
  usedOneTimePrekeyId: string | null;
};

function deriveSharedKey(...dhOutputs: Uint8Array[]): Uint8Array {
  return hkdf(
    sha256,
    concatBytes(...dhOutputs),
    new Uint8Array(32),
    utf8ToBytes("X3DH"),
    32,
  );
}

function verifyBundle(bundle: DeviceBundle) {
  const identityKeyEd = decodeBase64(bundle.identityKey);
  const spkPub = decodeBase64(bundle.signedPrekey);
  const signature = decodeBase64(bundle.signedPrekeySignature);

  if (!ed25519.verify(signature, spkPub, identityKeyEd)) {
    throw new Error(
      "Signed prekey signature is invalid — refusing to start a session (possible tampering)",
    );
  }

  return { theirIdentityX: ed25519.utils.toMontgomery(identityKeyEd), spkPub };
}

export function initiateSession(
  myIdentityPrivateEd: Uint8Array,
  bundle: DeviceBundle,
) {
  const { theirIdentityX, spkPub } = verifyBundle(bundle);
  const myIdentityXPriv = ed25519.utils.toMontgomerySecret(myIdentityPrivateEd);

  const ephemeralPrivate = x25519.utils.randomSecretKey();
  const ephemeralPublic = x25519.getPublicKey(ephemeralPrivate);

  const sharedKey = deriveSharedKey(
    x25519.getSharedSecret(myIdentityXPriv, spkPub),
    x25519.getSharedSecret(ephemeralPrivate, theirIdentityX),
    x25519.getSharedSecret(ephemeralPrivate, spkPub),
    bundle.oneTimePrekey
      ? x25519.getSharedSecret(
          ephemeralPrivate,
          decodeBase64(bundle.oneTimePrekey.key),
        )
      : new Uint8Array(0),
  );

  return {
    sharedKey,
    theirInitialRatchetPublic: spkPub,
    x3dhHeader: {
      ephemeralPublicKey: fromByteArray(ephemeralPublic),
      usedOneTimePrekeyId: bundle.oneTimePrekey?.id ?? null,
    } satisfies X3dhHeader,
  };
}

export function respondToSession(
  myIdentityPrivateEd: Uint8Array,
  mySignedPrekeyPrivate: Uint8Array,
  myOneTimePrekeyPrivate: Uint8Array | null,
  theirIdentityKeyBase64: string,
  header: X3dhHeader,
): Uint8Array {
  const myIdentityXPriv = ed25519.utils.toMontgomerySecret(myIdentityPrivateEd);
  const theirIdentityX = ed25519.utils.toMontgomery(
    decodeBase64(theirIdentityKeyBase64),
  );
  const theirEphemeral = decodeBase64(header.ephemeralPublicKey);

  return deriveSharedKey(
    x25519.getSharedSecret(mySignedPrekeyPrivate, theirIdentityX),
    x25519.getSharedSecret(myIdentityXPriv, theirEphemeral),
    x25519.getSharedSecret(mySignedPrekeyPrivate, theirEphemeral),
    myOneTimePrekeyPrivate
      ? x25519.getSharedSecret(myOneTimePrekeyPrivate, theirEphemeral)
      : new Uint8Array(0),
  );
}
