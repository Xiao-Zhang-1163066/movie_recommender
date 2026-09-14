import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { chat, getConversation, getConversations } from "../controller/chatController.js";
import chatLimiter from "../middleware/chatLimiter.js";
import { validate } from "../middleware/validateRequest.js";
import { chatMessageSchema } from "../validators/chatValidators.js";

const router = express.Router();

// protect runs first because chatLimiter keys its counter on req.user.id.
// chatLimiter runs before validate so that a flood of malformed requests still
// counts against the sender's quota instead of being waved through for free.
router.post("/", protect, chatLimiter, validate(chatMessageSchema), chat);

// Reading stored conversations is a cheap database read with no model call, so
// neither route is worth spending the chat quota on.
//
// The collection route is declared before the parameterised one. Express matches
// in order, so "/" and "/:conversationId" cannot collide, but keeping the
// specific route first is the habit that stops a later "/recent" or "/search"
// from being swallowed as an id.
router.get("/", protect, getConversations);
router.get("/:conversationId", protect, getConversation);

export default router;
