import { Router } from "express";
import {
  claimOneTimePrekey,
  getDeviceBundles,
  getDeviceInfo,
  getPrekeyCount,
  uploadPrekeys,
} from "../controllers/keys.controller";
import { requireAuth } from "../middlewares/require-auth";

const router = Router();

router.get("/keys/:userId", requireAuth, getDeviceBundles);
router.post("/prekeys", requireAuth, uploadPrekeys);
router.get("/prekeys/count", requireAuth, getPrekeyCount);
router.get("/devices/:deviceId", requireAuth, getDeviceInfo);
router.post(
  "/devices/:deviceId/one-time-prekey",
  requireAuth,
  claimOneTimePrekey,
);

export default router;
