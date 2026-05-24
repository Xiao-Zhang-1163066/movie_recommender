import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { chat } from "../controller/chatController.js";
import chatLimiter from "../middleware/chatLimiter.js";

const router = express.Router();

router.post("/", protect, chatLimiter, chat);

export default router;
