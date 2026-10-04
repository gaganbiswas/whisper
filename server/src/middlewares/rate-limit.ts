import type { Request, Response, NextFunction } from "express";
import { redis } from "bun";
import { normalizeEmail } from "../lib/utils";

type Rule = {
  name: string;
  limit: number;
  windowSeconds: number;
  key: (req: Request) => string | null;
};

const INCR_WITH_TTL = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return {count, redis.call("TTL", KEYS[1])}
`;

export const byIp = (req: Request) => req.ip ?? null;
export const byEmail = (req: Request) =>
  normalizeEmail(req.body?.email) || null;

export function rateLimit(...rules: Rule[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      for (const rule of rules) {
        const id = rule.key(req);
        if (!id) continue;

        const [count, ttl] = (await redis.send("EVAL", [
          INCR_WITH_TTL,
          "1",
          `rl:${rule.name}:${id}`,
          String(rule.windowSeconds),
        ])) as [number, number];

        if (count > rule.limit) {
          res.set("Retry-After", String(Math.max(ttl, 1)));
          return res
            .status(429)
            .json({ message: "Too many requests. Please try again later." });
        }
      }
    } catch (error) {
      console.error(error);
      return res
        .status(503)
        .json({ message: "Service temporarily unavailable" });
    }

    next();
  };
}
