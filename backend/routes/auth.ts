import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../config/dbConnect.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? "secret-kryze-token-key-change-this-in-production";

// GET /api/auth/me
router.get("/me", authenticateToken, (req: AuthRequest, res: Response): void => {
  res.json({ user: req.user });
});

// POST /api/auth/signup
router.post("/signup", async (req, res): Promise<void> => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(400).json({ error: "User with this email already exists" });
      return;
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user in NeonDB
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "30d",
    });

    res.status(201).json({
      user,
      token,
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "30d",
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const googleClient = new OAuth2Client();

// POST /api/auth/google
router.post("/google", async (req, res): Promise<void> => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      res.status(400).json({ error: "idToken is required" });
      return;
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
      });
      payload = ticket.getPayload();
    } catch (err: any) {
      console.error("Google ID Token verification failed:", err);
      res.status(401).json({ error: "Invalid Google ID token" });
      return;
    }

    if (!payload || !payload.email) {
      res.status(400).json({ error: "Invalid token payload" });
      return;
    }

    const email = payload.email.toLowerCase();
    const googleId = payload.sub;
    const name = payload.name || `${payload.given_name || ""} ${payload.family_name || ""}`.trim();

    // Find user in NeonDB by googleId first
    let user = await prisma.user.findUnique({
      where: { googleId },
    });

    if (!user) {
      // Find user by email (in case they previously registered with email/password)
      user = await prisma.user.findUnique({
        where: { email },
      });

      if (user) {
        // Link googleId to their existing email account
        user = await prisma.user.update({
          where: { email },
          data: { googleId },
        });
      } else {
        // Create new user for Google Sign-In
        user = await prisma.user.create({
          data: {
            email,
            googleId,
            name: name || null,
          },
        });
      }
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "30d",
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
    });
  } catch (error) {
    console.error("Google Sign-In error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
