import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  getMe,
  signup,
  login,
  googleSignIn,
  sendVerificationCode,
  verifyVerificationCode,
  updateProfile,
  searchUsers
} from "../controllers/auth.js";

const router = Router();

// GET /api/auth/users/search
router.get("/users/search", authenticateToken, searchUsers);

// GET /api/auth/me
router.get("/me", authenticateToken, getMe);

// POST /api/auth/signup
router.post("/signup", signup);

// POST /api/auth/login
router.post("/login", login);

// POST /api/auth/google
router.post("/google", googleSignIn);

// POST /api/auth/phone/send
router.post("/phone/send", sendVerificationCode);

// POST /api/auth/phone/verify
router.post("/phone/verify", verifyVerificationCode);

// PUT /api/auth/profile
router.put("/profile", authenticateToken, updateProfile);

export default router;
