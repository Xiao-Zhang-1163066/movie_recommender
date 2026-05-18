import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getAllCinemas,
  getCinemaBySlug,
} from "../controller/cinemaController.js";

const router = express.Router();

//public routes
router.get("/", getAllCinemas);
router.get("/:slug", getCinemaBySlug);

export default router;
