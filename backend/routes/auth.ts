import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import twilio from "twilio";
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
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_ID, 
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

// Initialize Twilio client conditionally
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let twilioClient: any = null;
if (twilioAccountSid && twilioAuthToken) {
  twilioClient = twilio(twilioAccountSid, twilioAuthToken);
}

export function normalizePhoneNumber(phone: string): string {
  // Strip all whitespace, dashes, parentheses, etc. except the leading '+'
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  
  // If it's a 10-digit number (e.g. 9354644369), prepend '+91'
  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  
  // If it's 12 digits starting with '91' but no '+' (e.g. 919354644369), prepend '+'
  if (/^91\d{10}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  
  // Ensure it starts with '+'
  if (!cleaned.startsWith("+")) {
    return `+${cleaned}`;
  }
  
  return cleaned;
}

// POST /api/auth/phone/send
router.post("/phone/send", async (req, res): Promise<void> => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      res.status(400).json({ error: "Phone number is required" });
      return;
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    // Generate a 6-digit OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiration

    // Save or update (upsert) the verification code in DB
    await prisma.phoneVerification.upsert({
      where: { phoneNumber: normalizedPhone },
      update: { code, expiresAt },
      create: { phoneNumber: normalizedPhone, code, expiresAt },
    });

    const disableRealSms = process.env.DISABLE_REAL_SMS === "true";
    const isMockNumber = normalizedPhone.includes("00000") || normalizedPhone.includes("12345");

    // Send the SMS
    if (twilioClient && twilioPhoneNumber && !disableRealSms && !isMockNumber) {
      try {
        await twilioClient.messages.create({
          body: `Your Kryze verification code is: ${code}. It expires in 5 minutes.`,
          from: twilioPhoneNumber,
          to: normalizedPhone,
        });
        console.log(`SMS sent successfully to ${normalizedPhone}`);
      } catch (smsError: any) {
        console.error("Failed to send SMS via Twilio:", smsError);
        // If not in production, fall back to console logging so testing/development is not blocked
        if (process.env.NODE_ENV !== "production") {
          console.warn("Falling back to console logging due to Twilio error.");
          console.log(`\n--- [SMS FALLBACK LOG (TWILIO ERROR)] ---`);
          console.log(`To: ${normalizedPhone}`);
          console.log(`Code: ${code}`);
          console.log(`-----------------------------------------\n`);
        } else {
          res.status(500).json({ error: "Failed to send verification SMS" });
          return;
        }
      }
    } else {
      // Console logging fallback
      console.log(`\n--- [SMS FALLBACK LOG (SIMULATOR/MOCK)] ---`);
      console.log(`To: ${normalizedPhone}`);
      console.log(`Code: ${code}`);
      console.log(`------------------------------------------\n`);
    }

    res.json({ message: "Verification code sent successfully" });
  } catch (error) {
    console.error("Phone send OTP error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/phone/verify
router.post("/phone/verify", async (req, res): Promise<void> => {
  try {
    const { phoneNumber, code } = req.body;

    if (!phoneNumber || !code) {
      res.status(400).json({ error: "Phone number and verification code are required" });
      return;
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    // Lookup verification entry
    const verification = await prisma.phoneVerification.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!verification) {
      res.status(400).json({ error: "No pending verification found for this phone number" });
      return;
    }

    // Check if code matches
    if (verification.code !== code) {
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }

    // Check if code is expired
    if (new Date() > verification.expiresAt) {
      // Delete expired code
      await prisma.phoneVerification.delete({ where: { phoneNumber: normalizedPhone } }).catch(() => {});
      res.status(400).json({ error: "Verification code has expired" });
      return;
    }

    // Delete the verification record since it is now successfully verified
    await prisma.phoneVerification.delete({
      where: { phoneNumber: normalizedPhone },
    });

    // Find or create the user in NeonDB by phoneNumber
    let user = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!user) {
      // Register a new user with just the phone number.
      user = await prisma.user.create({
        data: {
          phoneNumber: normalizedPhone,
        },
      });
    }

    // Generate JWT token for user session
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "30d",
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        name: user.name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      token,
    });
  } catch (error) {
    console.error("Phone verify OTP error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/auth/profile
router.put("/profile", authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { name, email } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const updateData: any = { name: name.trim() };

    if (email) {
      const normalizedEmail = email.toLowerCase().trim();

      // Check if email is already taken by another user
      const existingUser = await prisma.user.findFirst({
        where: {
          email: normalizedEmail,
          NOT: { id: userId },
        },
      });

      if (existingUser) {
        res.status(400).json({ error: "Email is already in use by another account" });
        return;
      }

      updateData.email = normalizedEmail;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    res.json({
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
        name: updatedUser.name,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
