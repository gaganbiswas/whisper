import { Router } from "express";

import authRoute from "./auth.route";
import messagesRoute from "./messages.route";
import usersRoute from "./users.route";

const router = Router();

router.use(authRoute);
router.use(messagesRoute);
router.use(usersRoute);

export default router;
