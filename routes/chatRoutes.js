import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { chat, getConversation } from "../controller/chatController.js";
import chatLimiter from "../middleware/chatLimiter.js";
import { validate } from "../middleware/validateRequest.js";
import { chatMessageSchema } from "../validators/chatValidators.js";

const router = express.Router();

// protect runs first because chatLimiter keys its counter on req.user.id.
// chatLimiter runs before validate so that a flood of malformed requests still
// counts against the sender's quota instead of being waved through for free.
router.post("/", protect, chatLimiter, validate(chatMessageSchema), chat);

// Reading a stored conversation is a cheap database read with no model call, so
// it is not worth spending the chat quota on.
router.get("/:conversationId", protect, getConversation);

export default router;
