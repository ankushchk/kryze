import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { getPremiumStatus } from "../controllers/premium.js";

const router = Router();

// GET /api/premium/status
router.get("/status", authenticateToken, getPremiumStatus);

export default router;
