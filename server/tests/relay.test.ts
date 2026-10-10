import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { once } from "events";
import { WebSocket } from "ws";
import { attachRelay } from "../src/controllers/relay.controller";

// In-memory stand-in for Bun's Redis client, which only exists under the Bun runtime
jest.mock(
  "bun",
  () => {
    const hashes = new Map<string, Map<string, string>>();
    const hash = (key: string) => {
      if (!hashes.has(key)) hashes.set(key, new Map());
      return hashes.get(key)!;
    };
    return {
      __hashes: hashes,
      redis: {
        hset: async (key: string, fields: Record<string, string>) => {
          for (const [field, value] of Object.entries(fields)) {
            hash(key).set(field, value);
          }
        },
        hdel: async (key: string, field: string) => hash(key).delete(field),
        hvals: async (key: string) => [...hash(key).values()],
        expire: async () => {},
        del: async (key: string) => hashes.delete(key),
      },
    };
  },
  { virtual: true },
);

jest.mock("../src/db/connect", () => ({
  __esModule: true,
  default: jest.fn(async () => []),
}));

jest.mock("../src/lib/device-auth", () => {
  const devices: Record<string, { id: number; deviceId: string; userId: number }> = {
    "alice-token": { id: 1, deviceId: "alice-phone", userId: 1 },
    "bob-token": { id: 2, deviceId: "bob-phone", userId: 2 },
  };
  return {
    getDeviceFromToken: async (token: string) => devices[token] ?? null,
  };
});

type Client = {
  ws: WebSocket;
  received: any[];
  send: (data: unknown) => void;
  waitFor: (match: (message: any) => boolean) => Promise<any>;
  close: () => Promise<void>;
};

let server: Server;
let url: string;
const clients: Client[] = [];

async function connect(token: string): Promise<Client> {
  const ws = new WebSocket(url);
  const received: any[] = [];
  const listeners = new Set<() => void>();

  ws.on("message", (raw) => {
    received.push(JSON.parse(raw.toString()));
    listeners.forEach((listener) => listener());
  });
  await once(ws, "open");

  const client: Client = {
    ws,
    received,
    send: (data) => ws.send(JSON.stringify(data)),
    waitFor: (match) =>
      new Promise((resolve) => {
        const check = () => {
          const found = received.find(match);
          if (!found) return;
          listeners.delete(check);
          resolve(found);
        };
        listeners.add(check);
        check();
      }),
    close: async () => {
      if (ws.readyState === WebSocket.CLOSED) return;
      ws.close();
      await once(ws, "close");
    },
  };
  clients.push(client);

  client.send({ type: "auth", token });
  await client.waitFor((m) => m.type === "auth_ok");
  return client;
}

const messageTo = (toDevice: string, id: string) => ({
  type: "message",
  id,
  toDevice,
  payload: `ciphertext-${id}`,
  header: { dhPub: "abc", previousChainLength: 0, messageNumber: 0 },
});

beforeAll(async () => {
  server = createServer();
  attachRelay(server);
  server.listen(0);
  await once(server, "listening");
  url = `ws://localhost:${(server.address() as AddressInfo).port}/ws`;
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  require("bun").__hashes.clear();
});

afterAll(async () => {
  server.close();
  await once(server, "close");
});

describe("message relay", () => {
  it("delivers to an online device immediately and stamps the authenticated sender", async () => {
    const alice = await connect("alice-token");
    const bob = await connect("bob-token");

    alice.send({ ...messageTo("bob-phone", "m1"), fromDevice: "mallory-phone" });

    await alice.waitFor((m) => m.type === "sent" && m.id === "m1");
    const delivered = await bob.waitFor(
      (m) => m.type === "message" && m.id === "m1",
    );
    expect(delivered).toMatchObject({
      fromDevice: "alice-phone",
      payload: "ciphertext-m1",
      header: { messageNumber: 0 },
    });
  });

  it("queues messages for an offline device and drops them once acknowledged", async () => {
    const alice = await connect("alice-token");
    alice.send(messageTo("bob-phone", "m1"));
    alice.send(messageTo("bob-phone", "m2"));
    await alice.waitFor((m) => m.type === "sent" && m.id === "m2");

    const bob = await connect("bob-token");
    await bob.waitFor((m) => m.type === "message" && m.id === "m2");
    expect(
      bob.received.filter((m) => m.type === "message").map((m) => m.id),
    ).toEqual(["m1", "m2"]);

    bob.send({ type: "ack", id: "m1" });
    await bob.close();

    const bobAgain = await connect("bob-token");
    await bobAgain.waitFor((m) => m.type === "message" && m.id === "m2");
    expect(
      bobAgain.received.filter((m) => m.type === "message").map((m) => m.id),
    ).toEqual(["m2"]);
  });
});
