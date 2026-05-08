import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getAllMovies,
  getMovieById,
  createMovie,
  updateMovie,
  deleteMovie,
} from "../controller/movieController.js";
import { validate } from "../middleware/validateRequest.js";

import {
  createMovieSchema,
  updateMovieSchema,
} from "../validators/movieValidators.js";
const router = express.Router();

//public routes
router.get("/", getAllMovies);
router.get("/:id", getMovieById);

//protected routes
router.post("/", protect, validate(createMovieSchema), createMovie);
router.put("/:id", protect, validate(updateMovieSchema), updateMovie);
router.delete("/:id", protect, deleteMovie);

export default router;
