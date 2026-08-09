import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { getCoinBalance, getCoinHistory, redeemCoins } from "../controllers/coins.js";

const router = Router();

// GET /api/coins/balance
router.get("/balance", authenticateToken, getCoinBalance);

// GET /api/coins/history
router.get("/history", authenticateToken, getCoinHistory);

// POST /api/coins/redeem
router.post("/redeem", authenticateToken, redeemCoins);

export default router;
