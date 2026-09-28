import type { Request, Response } from "express";
import db from "../db/connect";

type PrekeyUpload = { id: string; key: string };

const MAX_PREKEYS_PER_UPLOAD = 200;

export const getDeviceBundles = async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  try {
    const devices = await db`
      SELECT d.device_id, d.public_key, s.key AS spk, s.signature
      FROM devices d
      JOIN signed_prekeys s ON s.device_id = d.id
      WHERE d.user_id = ${userId} AND d.revoked_at IS NULL
    `;

    if (devices.length === 0) {
      return res
        .status(404)
        .json({ message: "This user has no devices with completed key setup" });
    }

    const bundles = devices.map((device: any) => ({
      deviceId: device.device_id,
      identityKey: device.public_key,
      signedPrekey: device.spk,
      signedPrekeySignature: device.signature,
    }));

    return res.status(200).json({ bundles });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Something went wrong while processing your request" });
  }
};

export const claimOneTimePrekey = async (req: Request, res: Response) => {
  const { deviceId } = req.params;

  try {
    const claimed = (
      await db`
        DELETE FROM one_time_prekeys
        WHERE id = (
          SELECT o.id FROM one_time_prekeys o
          JOIN devices d ON d.id = o.device_id
          WHERE d.device_id = ${deviceId} AND d.revoked_at IS NULL
          LIMIT 1
        )
        RETURNING id, key
      `
    )[0];

    return res.status(200).json({
      oneTimePrekey: claimed ? { id: claimed.id, key: claimed.key } : null,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Something went wrong while processing your request" });
  }
};

export const uploadPrekeys = async (req: Request, res: Response) => {
  const { signedPrekey, oneTimePrekeys } = req.body ?? {};
  const device = req.device!;

  if (
    (signedPrekey !== undefined &&
      (!signedPrekey?.key || !signedPrekey?.signature)) ||
    !Array.isArray(oneTimePrekeys) ||
    oneTimePrekeys.length > MAX_PREKEYS_PER_UPLOAD ||
    !oneTimePrekeys.every((otp: PrekeyUpload) => otp?.id && otp?.key)
  ) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    await db.transaction(async (tx) => {
      if (signedPrekey) {
        await tx`
          INSERT INTO signed_prekeys (device_id, key, signature)
          VALUES (${device.id}, ${signedPrekey.key}, ${signedPrekey.signature})
          ON CONFLICT (device_id) DO UPDATE SET key = excluded.key, signature = excluded.signature, created_at = datetime('now')
        `;
      }

      for (const otp of oneTimePrekeys as PrekeyUpload[]) {
        await tx`INSERT INTO one_time_prekeys (id, device_id, key) VALUES (${otp.id}, ${device.id}, ${otp.key})`;
      }
    });

    return res.status(200).json({ message: "Prekeys uploaded" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Something went wrong while processing your request" });
  }
};

export const getPrekeyCount = async (req: Request, res: Response) => {
  const device = req.device!;

  try {
    const row = (
      await db`SELECT count(*) AS count FROM one_time_prekeys WHERE device_id = ${device.id}`
    )[0];
    return res.status(200).json({ count: row.count });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Something went wrong while processing your request" });
  }
};

export const getDeviceInfo = async (req: Request, res: Response) => {
  const { deviceId } = req.params;

  try {
    const row = (
      await db`SELECT user_id, public_key FROM devices WHERE device_id = ${deviceId} AND revoked_at IS NULL LIMIT 1`
    )[0];
    if (!row) {
      return res.status(404).json({ message: "Unknown or revoked device" });
    }

    return res
      .status(200)
      .json({ userId: row.user_id, identityKey: row.public_key });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Something went wrong while processing your request" });
  }
};
