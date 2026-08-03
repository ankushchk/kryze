import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  createGroup,
  listGroups,
  addGroupMember,
  getGroupDetails,
  createExpense,
  updateExpense,
  deleteExpense,
  updateGroup,
  deleteGroup,
  removeGroupMember,
  verifyExpense,
  updateMemberUpi,
  createSettlementPaymentLink,
  handleMockCheckoutPage,
  handleSettlementCallback
} from "../controllers/groups.js";

const router = Router();

// Public payment sandbox and callbacks
router.get("/settlement/mock-checkout", handleMockCheckoutPage);
router.get("/settlement/callback", handleSettlementCallback);

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

// PATCH /api/groups/:id/expenses/:expenseId
router.patch("/:id/expenses/:expenseId", authenticateToken, updateExpense);

// DELETE /api/groups/:id/expenses/:expenseId
router.delete("/:id/expenses/:expenseId", authenticateToken, deleteExpense);

// PATCH /api/groups/:id/expenses/:expenseId/verify
router.patch("/:id/expenses/:expenseId/verify", authenticateToken, verifyExpense);

// PATCH /api/groups/:id/members/:memberId/upi
router.patch("/:id/members/:memberId/upi", authenticateToken, updateMemberUpi);

// POST /api/groups/:id/settlement/pay
router.post("/:id/settlement/pay", authenticateToken, createSettlementPaymentLink);

export default router;
