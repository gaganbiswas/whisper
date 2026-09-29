import { useEffect, useRef, useState, useCallback } from "react";
import { AppState } from "react-native";
import * as Crypto from "expo-crypto";
import { x25519 } from "@noble/curves/ed25519.js";
import ax from "./axios";
import { getIdentityPrivateKey } from "./signal-protocol/security";
import {
  getSignedPrekeyPrivate,
  consumeLocalOneTimePrekey,
  replenishOneTimePrekeys,
} from "./signal-protocol/prekeys";
import {
  initiateSession,
  respondToSession,
  type DeviceBundle,
  type X3dhHeader,
} from "./signal-protocol/x3dh";
import {
  initRatchetAlice,
  initRatchetBob,
  ratchetEncrypt,
  ratchetDecrypt,
  type RatchetHeader,
  type RatchetState,
} from "./signal-protocol/double-rachet";
import {
  loadSession,
  saveSession,
  initSessionStore,
} from "./signal-protocol/session-store";
import {
  advanceMessageStatus,
  getPendingMessages,
  getUnseenMessageIds,
  hasMessage,
  initLocalDb,
  saveConversation,
  saveMessage,
  type ChatMessage,
} from "../db/init";
import { getDeviceId, STORAGE_KEYS } from "./utils";
import storage from "./storage";

type ReceiptStatus = "delivered" | "seen";

type IncomingEnvelope = {
  type: "auth_ok" | "message" | "sent" | "receipt" | "error";
  id: string;
  fromDevice?: string;
  payload?: string;
  header?: RatchetHeader;
  x3dh?: X3dhHeader;
  ts?: number;
  fromUser?: number;
  status?: ReceiptStatus;
  ids?: string[];
};

type IncomingMessage = {
  id: string;
  fromDevice: string;
  payload: string;
  header: RatchetHeader;
  x3dh?: X3dhHeader;
  ts: number;
};

type MessageBody = { to: number; text: string };

type DeviceInfo = { userId: number; identityKey: string };

const MAX_RECEIPT_IDS = 500;

const deviceInfoCache = new Map<string, DeviceInfo>();

async function getDeviceInfo(deviceId: string): Promise<DeviceInfo> {
  const cached = deviceInfoCache.get(deviceId);
  if (cached) return cached;
  const { data } = await ax.get<DeviceInfo>(`/devices/${deviceId}`);
  deviceInfoCache.set(deviceId, data);
  return data;
}

function topUpPrekeys() {
  replenishOneTimePrekeys().catch((error) =>
    console.warn("Could not replenish one-time prekeys", error),
  );
}

let sessionQueue: Promise<unknown> = Promise.resolve();

function withSessionLock<T>(task: () => Promise<T>): Promise<T> {
  const result = sessionQueue.then(task);
  sessionQueue = result.catch(() => {});
  return result;
}

async function acceptSession(
  senderIdentityKey: string,
  x3dh: X3dhHeader,
): Promise<RatchetState> {
  const myIdentityPriv = await getIdentityPrivateKey();
  const mySpkPriv = await getSignedPrekeyPrivate();

  let myOtpPriv: Uint8Array | null = null;
  if (x3dh.usedOneTimePrekeyId) {
    myOtpPriv = await consumeLocalOneTimePrekey(x3dh.usedOneTimePrekeyId);
    if (!myOtpPriv) {
      throw new Error(
        `One-time prekey ${x3dh.usedOneTimePrekeyId} not found on this device`,
      );
    }
  }

  const sharedKey = respondToSession(
    myIdentityPriv,
    mySpkPriv,
    myOtpPriv,
    senderIdentityKey,
    x3dh,
  );
  return initRatchetBob(sharedKey, mySpkPriv, x25519.getPublicKey(mySpkPriv));
}

/** Returns the sender's user id when a new message from someone else was stored. */
async function receiveMessage(
  myUserId: number,
  message: IncomingMessage,
): Promise<number | null> {
  if (await hasMessage(message.id)) return null;

  const sender = await getDeviceInfo(message.fromDevice);
  const session = message.x3dh
    ? await acceptSession(sender.identityKey, message.x3dh)
    : await loadSession(message.fromDevice);
  if (!session) {
    throw new Error(`No session with device ${message.fromDevice}`);
  }

  const { to, text }: MessageBody = JSON.parse(
    ratchetDecrypt(session, message.header, message.payload),
  );
  await saveSession(message.fromDevice, session);

  const fromMyOtherDevice = sender.userId === myUserId;
  if (fromMyOtherDevice && !Number.isInteger(to)) {
    throw new Error("Synced message is missing its recipient");
  }
  const peerId = fromMyOtherDevice ? to : sender.userId;

  await saveConversation(peerId);
  await saveMessage({
    id: message.id,
    from_user: sender.userId,
    to_user: fromMyOtherDevice ? peerId : myUserId,
    text,
    ts: message.ts,
    status: fromMyOtherDevice ? "sent" : "delivered",
  });
  return fromMyOtherDevice ? null : sender.userId;
}

function sendReceipt(
  ws: WebSocket,
  toUser: number,
  status: ReceiptStatus,
  ids: string[],
) {
  for (let i = 0; i < ids.length; i += MAX_RECEIPT_IDS) {
    ws.send(
      JSON.stringify({
        type: "receipt",
        toUser,
        status,
        ids: ids.slice(i, i + MAX_RECEIPT_IDS),
      }),
    );
  }
}

async function fetchBundles(userId: number) {
  const { data } = await ax.get<{ bundles: DeviceBundle[] }>(`/keys/${userId}`);
  return data.bundles;
}

/** Encrypts a stored message for every recipient device and hands it to the relay. */
async function transmitMessage(
  ws: WebSocket,
  myUserId: number,
  message: ChatMessage,
) {
  const [peerBundles, myBundles, myDeviceId, myIdentityPriv] =
    await Promise.all([
      fetchBundles(message.to_user),
      fetchBundles(myUserId),
      getDeviceId(),
      getIdentityPrivateKey(),
    ]);

  const bundles = [
    ...peerBundles,
    ...myBundles.filter((bundle) => bundle.deviceId !== myDeviceId),
  ];
  const body: MessageBody = { to: message.to_user, text: message.text };

  await withSessionLock(async () => {
    for (const bundle of bundles) {
      let session = await loadSession(bundle.deviceId);
      let x3dh: X3dhHeader | undefined;

      if (!session) {
        const { data: claimed } = await ax.post(
          `/devices/${bundle.deviceId}/one-time-prekey`,
        );
        const result = initiateSession(myIdentityPriv, {
          ...bundle,
          oneTimePrekey: claimed.oneTimePrekey,
        });
        session = initRatchetAlice(
          result.sharedKey,
          result.theirInitialRatchetPublic,
        );
        x3dh = result.x3dhHeader;
      }

      const { header, payload } = ratchetEncrypt(session, JSON.stringify(body));
      await saveSession(bundle.deviceId, session);

      ws.send(
        JSON.stringify({
          type: "message",
          id: message.id,
          toDevice: bundle.deviceId,
          payload,
          header,
          x3dh,
        }),
      );
    }
  });
}

export function useChatSocket(myUserId: number, wsUrl: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [isConnected, setIsConnected] = useState(false);
  const [messageVersion, setMessageVersion] = useState(0);
  const bumpMessageVersion = () => setMessageVersion((v) => v + 1);
  const flushing = useRef<Promise<void> | null>(null);
  const flushRequested = useRef(false);
  // Pending messages already handed to the relay
  const inFlight = useRef(new Set<string>());

  const flushOutbox = useCallback(() => {
    flushRequested.current = true;
    if (flushing.current) return flushing.current;

    flushing.current = (async () => {
      try {
        while (flushRequested.current) {
          flushRequested.current = false;
          const pending = await getPendingMessages(myUserId);
          for (const message of pending) {
            const ws = wsRef.current;
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            if (inFlight.current.has(message.id)) continue;
            inFlight.current.add(message.id);
            try {
              await transmitMessage(ws, myUserId, message);
            } catch (error) {
              inFlight.current.delete(message.id);
              // Stop here so next message can't overtake
              console.warn("Could not send message, will retry", error);
              return;
            }
          }
        }
      } finally {
        flushing.current = null;
      }
    })();
    return flushing.current;
  }, [myUserId]);

  const connect = useCallback(async () => {
    if (!myUserId) return;

    const token = await storage.getItem(STORAGE_KEYS.token);
    const current = wsRef.current;
    if (
      current?.readyState === WebSocket.OPEN ||
      current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }
    clearTimeout(reconnectTimer.current);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      let data: IncomingEnvelope;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === "auth_ok") {
        reconnectAttempt.current = 0;
        setIsConnected(true);
        topUpPrekeys();
        flushOutbox();
        return;
      }
      if (data.type === "sent") {
        inFlight.current.delete(data.id);
        advanceMessageStatus([data.id], "sent")
          .then((changed) => changed && bumpMessageVersion())
          .catch((error) => console.warn("Could not mark message sent", error));
        return;
      }
      if (data.type === "receipt") {
        const { fromUser, status, ids } = data;
        if (!fromUser || !status || !Array.isArray(ids)) return;
        advanceMessageStatus(ids, status, fromUser)
          .then((changed) => {
            if (changed) bumpMessageVersion();
            ws.send(JSON.stringify({ type: "ack", id: data.id }));
          })
          .catch((error) => console.warn("Could not apply receipt", error));
        return;
      }
      if (data.type === "error") {
        console.warn("Chat relay error", data);
        return;
      }
      if (
        data.type !== "message" ||
        !data.fromDevice ||
        !data.payload ||
        !data.header
      ) {
        return;
      }

      const message: IncomingMessage = {
        id: data.id,
        fromDevice: data.fromDevice,
        payload: data.payload,
        header: data.header,
        x3dh: data.x3dh,
        ts: data.ts ?? Date.now(),
      };

      withSessionLock(() => receiveMessage(myUserId, message))
        .then((senderUserId) => {
          bumpMessageVersion();
          if (message.x3dh) topUpPrekeys();
          ws.send(JSON.stringify({ type: "ack", id: message.id }));
          if (senderUserId !== null) {
            sendReceipt(ws, senderUserId, "delivered", [message.id]);
          }
        })
        .catch((err) =>
          console.error("Failed to process incoming message", err),
        );
    };

    ws.onclose = () => {
      setIsConnected(false);
      inFlight.current.clear();
      if (wsRef.current !== ws) return;
      const delay = Math.min(30000, 1000 * 2 ** reconnectAttempt.current);
      reconnectAttempt.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
  }, [wsUrl, myUserId, flushOutbox]);

  const sendMessage = useCallback(
    async (toUserId: number, text: string) => {
      // Stored immediately, delivered when connected
      await saveMessage({
        id: Crypto.randomUUID(),
        from_user: myUserId,
        to_user: toUserId,
        text,
        ts: Date.now(),
        status: "pending",
      });
      bumpMessageVersion();
      flushOutbox();
    },
    [myUserId, flushOutbox],
  );

  const markSeen = useCallback(
    async (peerId: number) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const ids = await getUnseenMessageIds(myUserId, peerId);
      if (!ids.length) return;
      sendReceipt(ws, peerId, "seen", ids);
      await advanceMessageStatus(ids, "seen");
    },
    [myUserId],
  );

  useEffect(() => {
    if (!myUserId) return;
    let cancelled = false;

    const initialize = async () => {
      await initSessionStore();
      await initLocalDb();
      if (!cancelled) await connect();
    };

    initialize().catch((error) => {
      console.warn("Could not initialize chat storage", error);
    });

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") connect();
    });

    return () => {
      cancelled = true;
      subscription.remove();
      clearTimeout(reconnectTimer.current);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [connect, myUserId]);

  return { isConnected, sendMessage, markSeen, messageVersion };
}
