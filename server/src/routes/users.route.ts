import { Router } from "express";
import {
  getUserById,
  lookupUserByEmail,
} from "../controllers/users.controller";
import { requireAuth } from "../middlewares/require-auth";

const router = Router();

router.get("/users/lookup", requireAuth, lookupUserByEmail);
router.get("/users/:id", requireAuth, getUserById);

export default router;
