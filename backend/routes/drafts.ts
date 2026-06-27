import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { createDraft, getDrafts, updateDraft } from "../controllers/drafts.js";

const router = Router();

// POST /api/drafts
router.post("/", authenticateToken, createDraft);

// GET /api/drafts
router.get("/", authenticateToken, getDrafts);

// PATCH /api/drafts/:id
router.patch("/:id", authenticateToken, updateDraft);

export default router;
