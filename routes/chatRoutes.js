import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { chat } from "../controller/chatController.js";
import chatLimiter from "../middleware/chatLimiter.js";
import { validate } from "../middleware/validateRequest.js";
import { chatMessageSchema } from "../validators/chatValidators.js";

const router = express.Router();

// protect runs first because chatLimiter keys its counter on req.user.id.
// chatLimiter runs before validate so that a flood of malformed requests still
// counts against the sender's quota instead of being waved through for free.
router.post("/", protect, chatLimiter, validate(chatMessageSchema), chat);

export default router;
