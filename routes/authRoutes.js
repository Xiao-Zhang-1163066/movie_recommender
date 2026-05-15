import express from "express";
import { register, login, logout, me } from "../controller/authController.js";
import { validate } from "../middleware/validateRequest.js";
import { loginSchema, registerSchema } from "../validators/authValidator.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/logout", logout);
router.get("/me", protect, me);

export default router;
