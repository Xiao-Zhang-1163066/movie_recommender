import express from "express";
import { getSessions } from "../controller/sessionController.js";

const router = express.Router();

router.get("/", getSessions);

export default router;
