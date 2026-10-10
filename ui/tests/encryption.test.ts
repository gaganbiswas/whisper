import { describe, expect, it } from "@jest/globals";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { fromByteArray } from "base64-js";
import {
  initiateSession,
  respondToSession,
  type DeviceBundle,
} from "../src/lib/signal-protocol/x3dh";
import {
  initRatchetAlice,
  initRatchetBob,
  ratchetDecrypt,
  ratchetEncrypt,
  type RatchetState,
} from "../src/lib/signal-protocol/double-rachet";

// Keys generated the same way generateAndUploadPrekeys does on a real device
function createDevice(deviceId: string) {
  const identityPriv = ed25519.utils.randomSecretKey();
  const signedPrekeyPriv = x25519.utils.randomSecretKey();
  const signedPrekeyPub = x25519.getPublicKey(signedPrekeyPriv);
  const oneTimePrekeyPriv = x25519.utils.randomSecretKey();

  const bundle: DeviceBundle = {
    deviceId,
    identityKey: fromByteArray(ed25519.getPublicKey(identityPriv)),
    signedPrekey: fromByteArray(signedPrekeyPub),
    signedPrekeySignature: fromByteArray(
      ed25519.sign(signedPrekeyPub, identityPriv),
    ),
    oneTimePrekey: {
      id: "otp-1",
      key: fromByteArray(x25519.getPublicKey(oneTimePrekeyPriv)),
    },
  };

  return {
    identityPriv,
    signedPrekeyPriv,
    signedPrekeyPub,
    oneTimePrekeyPriv,
    bundle,
  };
}

/** Runs X3DH between two fresh devices and returns both ratchet states. */
function establishSession(): { alice: RatchetState; bob: RatchetState } {
  const aliceDevice = createDevice("alice-phone");
  const bobDevice = createDevice("bob-phone");

  const initiated = initiateSession(aliceDevice.identityPriv, bobDevice.bundle);
  const bobSharedKey = respondToSession(
    bobDevice.identityPriv,
    bobDevice.signedPrekeyPriv,
    bobDevice.oneTimePrekeyPriv,
    aliceDevice.bundle.identityKey,
    initiated.x3dhHeader,
  );

  expect(bobSharedKey).toEqual(initiated.sharedKey);

  return {
    alice: initRatchetAlice(
      initiated.sharedKey,
      initiated.theirInitialRatchetPublic,
    ),
    bob: initRatchetBob(
      bobSharedKey,
      bobDevice.signedPrekeyPriv,
      bobDevice.signedPrekeyPub,
    ),
  };
}

describe("end-to-end encryption", () => {
  it("establishes a session over X3DH and exchanges messages both ways", () => {
    const { alice, bob } = establishSession();

    const first = ratchetEncrypt(alice, "hi bob");
    expect(first.payload).not.toContain("hi bob");
    expect(ratchetDecrypt(bob, first.header, first.payload)).toBe("hi bob");

    const reply = ratchetEncrypt(bob, "hey alice");
    expect(ratchetDecrypt(alice, reply.header, reply.payload)).toBe(
      "hey alice",
    );

    // Replying rotates the DH ratchet, so Alice's next message uses a new key
    const second = ratchetEncrypt(alice, "how are you?");
    expect(second.header.dhPub).not.toBe(first.header.dhPub);
    expect(ratchetDecrypt(bob, second.header, second.payload)).toBe(
      "how are you?",
    );
  });

  it("refuses to start a session with a tampered signed prekey", () => {
    const alice = createDevice("alice-phone");
    const bob = createDevice("bob-phone");
    const attackerPrekey = x25519.getPublicKey(x25519.utils.randomSecretKey());

    expect(() =>
      initiateSession(alice.identityPriv, {
        ...bob.bundle,
        signedPrekey: fromByteArray(attackerPrekey),
      }),
    ).toThrow(/signature is invalid/);
  });

  it("decrypts out-of-order messages and rejects replays", () => {
    const { alice, bob } = establishSession();

    const m0 = ratchetEncrypt(alice, "zero");
    const m1 = ratchetEncrypt(alice, "one");
    const m2 = ratchetEncrypt(alice, "two");

    expect(ratchetDecrypt(bob, m2.header, m2.payload)).toBe("two");
    expect(ratchetDecrypt(bob, m0.header, m0.payload)).toBe("zero");
    expect(ratchetDecrypt(bob, m1.header, m1.payload)).toBe("one");

    expect(() => ratchetDecrypt(bob, m1.header, m1.payload)).toThrow(
      /Duplicate message/,
    );
  });
});
