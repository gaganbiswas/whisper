import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import db from "../db/connect";
import { getDeviceFromToken } from "../lib/device-auth";
import { redis } from "bun";

const PENDING_TTL_SECONDS = 60 * 60 * 24 * 30;
const pendingKey = (deviceId: string) => `pending:${deviceId}`;

type ReceiptStatus = "delivered" | "seen";

type Envelope =
  | {
      type: "message";
      id: string;
      fromDevice: string;
      payload: string;
      header: unknown;
      x3dh?: unknown;
      ts: number;
    }
  | {
      type: "receipt";
      id: string;
      fromUser: number;
      status: ReceiptStatus;
      ids: string[];
      ts: number;
    };

const RECEIPT_STATUSES = new Set<ReceiptStatus>(["delivered", "seen"]);
const MAX_RECEIPT_IDS = 500;
const MAX_ID_LENGTH = 64;

const online = new Map<string, WebSocket>();

function send(ws: WebSocket, payload: unknown) {
  ws.send(JSON.stringify(payload));
}

function isValidId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH
  );
}

async function deliver(toDeviceId: string, envelope: Envelope) {
  const key = pendingKey(toDeviceId);
  await redis.hset(key, { [envelope.id]: JSON.stringify(envelope) });
  await redis.expire(key, PENDING_TTL_SECONDS);

  const recipient = online.get(toDeviceId);
  if (recipient?.readyState === WebSocket.OPEN) send(recipient, envelope);
}

async function acknowledge(deviceId: string, envelopeId: string) {
  await redis.hdel(pendingKey(deviceId), envelopeId);
}

async function getUserDeviceIds(userId: number): Promise<string[]> {
  const rows = await db`
    SELECT device_id FROM devices
    WHERE user_id = ${userId} AND revoked_at IS NULL
  `;
  return rows.map((row: { device_id: string }) => row.device_id);
}

export async function clearPendingForDevice(deviceId: string) {
  await redis.del(pendingKey(deviceId));
}

export function attachRelay(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    let deviceId: string | null = null;
    let userId: number | null = null;

    const onMessage = async (raw: Buffer) => {
      let data: any;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return send(ws, { type: "error", reason: "bad_json" });
      }

      switch (data.type) {
        case "auth": {
          const authed = data.token
            ? await getDeviceFromToken(String(data.token)).catch(() => null)
            : null;
          if (!authed) {
            return send(ws, { type: "error", reason: "bad_auth" });
          }
          deviceId = authed.deviceId;
          userId = authed.userId;
          online.set(deviceId, ws);
          send(ws, { type: "auth_ok", deviceId });
          const pending = (await redis.hvals(pendingKey(deviceId)))
            .map((raw) => JSON.parse(raw) as Envelope)
            .sort((a, b) => a.ts - b.ts);
          for (const envelope of pending) send(ws, envelope);
          break;
        }

        case "message": {
          if (!deviceId) {
            return send(ws, { type: "error", reason: "not_authed" });
          }
          if (
            typeof data.toDevice !== "string" ||
            !data.payload ||
            !isValidId(data.id)
          ) {
            return send(ws, { type: "error", reason: "bad_message" });
          }

          await deliver(data.toDevice, {
            type: "message",
            id: data.id,
            fromDevice: deviceId,
            payload: data.payload,
            header: data.header,
            x3dh: data.x3dh,
            ts: Date.now(),
          });
          send(ws, { type: "sent", id: data.id });
          break;
        }

        case "receipt": {
          if (!deviceId || userId === null) {
            return send(ws, { type: "error", reason: "not_authed" });
          }
          const toUser = Number(data.toUser);
          if (
            !Number.isInteger(toUser) ||
            toUser === userId ||
            !RECEIPT_STATUSES.has(data.status) ||
            !Array.isArray(data.ids) ||
            data.ids.length === 0 ||
            data.ids.length > MAX_RECEIPT_IDS ||
            !data.ids.every(isValidId)
          ) {
            return send(ws, { type: "error", reason: "bad_receipt" });
          }

          const fromUser = userId;
          const devices = await getUserDeviceIds(toUser).catch(() => []);
          for (const toDevice of devices) {
            await deliver(toDevice, {
              type: "receipt",
              id: crypto.randomUUID(),
              fromUser,
              status: data.status,
              ids: data.ids,
              ts: Date.now(),
            });
          }
          break;
        }

        case "ack": {
          if (deviceId && isValidId(data.id)) {
            await acknowledge(deviceId, data.id);
          }
          break;
        }

        default:
          send(ws, { type: "error", reason: "unknown_type" });
      }
    };

    ws.on("message", (raw: Buffer) => {
      onMessage(raw).catch((error) => {
        console.error(error);
        send(ws, { type: "error", reason: "server_error" });
      });
    });

    ws.on("close", () => {
      if (deviceId !== null && online.get(deviceId) === ws) {
        online.delete(deviceId);
      }
    });
  });
}
