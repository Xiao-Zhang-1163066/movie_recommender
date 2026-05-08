import express from "express";
import { register, login, logout } from "../controller/authController.js";
import { validate } from "../middleware/validateRequest.js";
import { loginSchema, registerSchema } from "../validators/authValidator.js";

const router = express.Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/logout", logout);

export default router;
