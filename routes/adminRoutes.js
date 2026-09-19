import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { requireAdmin } from "../middleware/adminMiddleware.js";
import {
  getAgentRuns,
  getAgentRunSummary,
} from "../controller/adminController.js";

const router = express.Router();

// Gate the whole router rather than each route. A route added below inherits
// the guard, so forgetting it can't quietly publish admin data.
// Order matters: protect loads req.user, requireAdmin reads it.
router.use(protect, requireAdmin);

// Declared before "/agent-runs" out of habit — Express matches in order, so a
// literal path always goes above anything that could swallow it.
router.get("/agent-runs/summary", getAgentRunSummary);
router.get("/agent-runs", getAgentRuns);

export default router;
