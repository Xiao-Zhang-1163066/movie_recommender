import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { chat } from "../controller/chatController.js";

const router = express.Router();

router.post("/", protect, chat);

export default router;
