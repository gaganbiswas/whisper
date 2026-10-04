import { Router } from "express";
import { sendCode, verifyCode } from "../controllers/auth.controller";
import { byEmail, byIp, rateLimit } from "../middlewares/rate-limit";

const WINDOW_SECONDS = 15 * 60;

const router = Router();

router.post(
  "/send-verification-code",
  rateLimit(
    { name: "send:ip", limit: 10, windowSeconds: WINDOW_SECONDS, key: byIp },
    { name: "send:email:cooldown", limit: 1, windowSeconds: 60, key: byEmail },
    { name: "send:email", limit: 3, windowSeconds: WINDOW_SECONDS, key: byEmail },
  ),
  sendCode,
);

router.post(
  "/verify-otp",
  rateLimit(
    { name: "verify:ip", limit: 30, windowSeconds: WINDOW_SECONDS, key: byIp },
    { name: "verify:email", limit: 5, windowSeconds: WINDOW_SECONDS, key: byEmail },
  ),
  verifyCode,
);

export default router;
