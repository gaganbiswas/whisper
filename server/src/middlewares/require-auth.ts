import type { Request, Response, NextFunction } from "express";
import {
  getDeviceFromToken,
  type AuthenticatedDevice,
} from "../lib/device-auth";

declare global {
  namespace Express {
    interface Request {
      device?: AuthenticatedDevice;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Missing bearer token" });
  }

  const device = await getDeviceFromToken(token);
  if (!device) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }

  req.device = device;
  next();
}
