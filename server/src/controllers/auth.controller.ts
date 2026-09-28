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
    await db`DELETE FROM otp WHERE user_id = ${userId}`;
    await db`INSERT INTO otp (user_id, otp) VALUES (${userId}, ${otp})`;
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

    const otpRecord = (
      await db`
        SELECT 1 FROM otp
        WHERE user_id = ${userId} AND otp = ${otp} AND expires_at > datetime('now')
      `
    )[0];

    if (!otpRecord) {
      return res.status(404).json({
        message: "The code entered is invalid. Try again.",
      });
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);

    await db.transaction(async (tx) => {
      await tx`DELETE FROM otp WHERE user_id = ${userId}`;

      // A device id identifies one physical install, so it can only belong
      // to one account at a time; revoke any other account still using it.
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
    // Anything queued was encrypted for this device's previous identity.
    clearPendingForDevice(deviceId);

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
