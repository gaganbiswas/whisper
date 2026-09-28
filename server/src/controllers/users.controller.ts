import type { Request, Response } from "express";
import db from "../db/connect";
import { isValidEmail, normalizeEmail } from "../lib/utils";

export const lookupUserByEmail = async (req: Request, res: Response) => {
  const email = normalizeEmail(req.query.email);
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Invalid email address" });
  }

  try {
    const row = (
      await db`SELECT id, email FROM users WHERE email = ${email} LIMIT 1`
    )[0];
    if (!row) {
      return res
        .status(404)
        .json({ message: "No account found for that email" });
    }
    return res.status(200).json({ id: row.id, email: row.email });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Something went wrong while processing your request" });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  try {
    const row = (
      await db`SELECT id, email FROM users WHERE id = ${userId} LIMIT 1`
    )[0];
    if (!row) return res.status(404).json({ message: "User not found" });
    return res.status(200).json({ id: row.id, email: row.email });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Something went wrong while processing your request" });
  }
};
