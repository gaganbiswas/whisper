import { Router } from "express";
import { sendCode, verifyCode } from "../controllers/auth.controller";

const router = Router();

router.post("/send-verification-code", sendCode);
router.post("/verify-otp", verifyCode);

export default router;
