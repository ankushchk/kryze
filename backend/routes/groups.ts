import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  createGroup,
  listGroups,
  addGroupMember,
  getGroupDetails,
  createExpense
} from "../controllers/groups.js";

const router = Router();

// POST /api/groups
router.post("/", authenticateToken, createGroup);

// GET /api/groups
router.get("/", authenticateToken, listGroups);

// GET /api/groups/:id
router.get("/:id", authenticateToken, getGroupDetails);

// POST /api/groups/:id/members
router.post("/:id/members", authenticateToken, addGroupMember);

// POST /api/groups/:id/expenses
router.post("/:id/expenses", authenticateToken, createExpense);

export default router;
