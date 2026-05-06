import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getAllMovies,
  getMovieById,
  createMovie,
  updateMovie,
  deleteMovie,
} from "../controller/movieController.js";
const router = express.Router();

//public routes
router.get("/", getAllMovies);
router.get("/:id", getMovieById);

//protected routes
router.post("/", protect, createMovie);
router.put("/:id", protect, updateMovie);
router.delete("/:id", protect, deleteMovie);

export default router;
