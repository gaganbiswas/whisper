import type { Request, Response } from "express";
import crypto from "node:crypto";
import db from "../db/connect";
import {
  generateOTP,
  hashToken,
  isValidEmail,
  normalizeEmail,
  sendEmail,
} from "../lib/utils";
import { clearPendingForDevice } from "./relay.controller";
import { redis } from "bun";

const OTP_TTL_SECONDS = 5 * 60;

export const sendCode = async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Invalid email address" });
  }

  try {
    await db`INSERT INTO users (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;
    const userId = (await db`SELECT id FROM users WHERE email = ${email}`)[0]
      .id;

    const otp = generateOTP();
    await redis.set(`otp:${userId}`, otp, "EX", OTP_TTL_SECONDS);
    await sendEmail(email, otp);

    return res.status(200).json({ message: "Verification code sent!" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Something went wrong while processing your request" });
  }
};

export const verifyCode = async (req: Request, res: Response) => {
  const { publicKey, deviceId } = req.body ?? {};
  const otp = String(req.body?.otp ?? "");
  const email = normalizeEmail(req.body?.email);

  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({
      message: "The code entered is invalid. Try again.",
    });
  }

  if (!publicKey || !deviceId) {
    return res.status(400).json({
      message: "Something went wrong while building your credentials",
    });
  }

  try {
    const user = (await db`SELECT id FROM users WHERE email = ${email}`)[0];
    if (!user) {
      return res.status(404).json({ message: "Invalid email address" });
    }
    const userId = user.id;

    const stored = await redis.get(`otp:${userId}`);
    if (stored !== otp) {
      return res
        .status(404)
        .json({ message: "The code entered is invalid. Try again." });
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);

    await db.transaction(async (tx) => {
      // A device id identifies one account connected to one device
      await tx`
        UPDATE devices SET revoked_at = datetime('now')
        WHERE device_id = ${deviceId} AND user_id != ${userId} AND revoked_at IS NULL
      `;

      const device = (
        await tx`
          INSERT INTO devices (user_id, public_key, auth_token_hash, device_id)
          VALUES (${userId}, ${publicKey}, ${tokenHash}, ${deviceId})
          ON CONFLICT (user_id, device_id) DO UPDATE SET
            public_key = excluded.public_key,
            auth_token_hash = excluded.auth_token_hash,
            revoked_at = NULL
          RETURNING id
        `
      )[0];

      await tx`DELETE FROM one_time_prekeys WHERE device_id = ${device.id}`;
    });

    await redis.del(`otp:${userId}`);
    // Anything queued was encrypted for this device's previous identity.
    await clearPendingForDevice(deviceId);

    return res
      .status(200)
      .json({ message: "Verification successful.", token, userId });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Something went wrong while processing your request",
    });
  }
};
