import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getWatchlist,
  addToWatchlist,
  updateWatchlistEntry,
  removeFromWatchlist,
} from "../controller/watchlistController.js";
import { validate } from "../middleware/validateRequest.js";
import {
  addToWatchlistSchema,
  updateWatchlistSchema,
} from "../validators/watchlistValidators.js";
const router = express.Router();

//protected routes
router.get("/", protect, getWatchlist);
router.post("/", protect, validate(addToWatchlistSchema), addToWatchlist);
router.put(
  "/:id",
  protect,
  validate(updateWatchlistSchema),
  updateWatchlistEntry,
);
router.delete("/:id", protect, removeFromWatchlist);

export default router;
