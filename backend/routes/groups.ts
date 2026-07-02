import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  createGroup,
  listGroups,
  addGroupMember,
  getGroupDetails,
  createExpense,
  updateGroup,
  deleteGroup,
  removeGroupMember,
  verifyExpense,
  updateMemberUpi
} from "../controllers/groups.js";

const router = Router();

// POST /api/groups
router.post("/", authenticateToken, createGroup);

// GET /api/groups
router.get("/", authenticateToken, listGroups);

// GET /api/groups/:id
router.get("/:id", authenticateToken, getGroupDetails);

// PATCH /api/groups/:id
router.patch("/:id", authenticateToken, updateGroup);

// DELETE /api/groups/:id
router.delete("/:id", authenticateToken, deleteGroup);

// POST /api/groups/:id/members
router.post("/:id/members", authenticateToken, addGroupMember);

// DELETE /api/groups/:id/members/:memberId
router.delete("/:id/members/:memberId", authenticateToken, removeGroupMember);

// POST /api/groups/:id/expenses
router.post("/:id/expenses", authenticateToken, createExpense);

// PATCH /api/groups/:id/expenses/:expenseId/verify
router.patch("/:id/expenses/:expenseId/verify", authenticateToken, verifyExpense);

// PATCH /api/groups/:id/members/:memberId/upi
router.patch("/:id/members/:memberId/upi", authenticateToken, updateMemberUpi);

export default router;
