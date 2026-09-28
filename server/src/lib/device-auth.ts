import db from "../db/connect";
import { hashToken } from "./utils";

export type AuthenticatedDevice = {
  id: number;
  deviceId: string;
  userId: number;
};

export async function getDeviceFromToken(
  token: string,
): Promise<AuthenticatedDevice | null> {
  const row = (
    await db`
      SELECT id, device_id, user_id
      FROM devices
      WHERE auth_token_hash = ${hashToken(token)} AND revoked_at IS NULL
      LIMIT 1
    `
  )[0];

  if (!row) return null;

  await db`UPDATE devices SET last_seen_at = datetime('now') WHERE id = ${row.id}`;

  return { id: row.id, deviceId: row.device_id, userId: row.user_id };
}
