import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getWatchlist,
  addToWatchlist,
  updateWatchlistEntry,
  removeFromWatchlist,
} from "../controller/watchlistController.js";
const router = express.Router();

//protected routes
router.get("/", protect, getWatchlist);
router.post("/", protect, addToWatchlist);
router.put("/:id", protect, updateWatchlistEntry);
router.delete("/:id", protect, removeFromWatchlist);

export default router;
