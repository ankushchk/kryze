import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import twilio from "twilio";
import { prisma } from "../config/dbConnect.js";
import { AuthRequest } from "../middleware/auth.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "secret-kryze-token-key-change-this-in-production";
const googleClient = new OAuth2Client();

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let twilioClient: any = null;
if (twilioAccountSid && twilioAuthToken) {
  twilioClient = twilio(twilioAccountSid, twilioAuthToken);
}

export function normalizePhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  if (/^91\d{10}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  if (!cleaned.startsWith("+")) {
    return `+${cleaned}`;
  }
  return cleaned;
}

// GET /api/auth/me
export const getMe = (req: AuthRequest, res: Response): void => {
  res.json({ user: req.user });
};

// POST /api/auth/signup
export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(400).json({ error: "User with this email already exists" });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

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
};

// POST /api/auth/login
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

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
};

// POST /api/auth/google
export const googleSignIn = async (req: Request, res: Response): Promise<void> => {
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

    let user = await prisma.user.findUnique({
      where: { googleId },
    });

    if (!user) {
      user = await prisma.user.findUnique({
        where: { email },
      });

      if (user) {
        user = await prisma.user.update({
          where: { email },
          data: { googleId },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email,
            googleId,
            name: name || null,
          },
        });
      }
    }

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
};

// POST /api/auth/phone/send
export const sendVerificationCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      res.status(400).json({ error: "Phone number is required" });
      return;
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.phoneVerification.upsert({
      where: { phoneNumber: normalizedPhone },
      update: { code, expiresAt },
      create: { phoneNumber: normalizedPhone, code, expiresAt },
    });

    const disableRealSms = process.env.DISABLE_REAL_SMS === "true";
    const isMockNumber = normalizedPhone.includes("00000") || normalizedPhone.includes("12345");

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
};

// POST /api/auth/phone/verify
export const verifyVerificationCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneNumber, code } = req.body;

    if (!phoneNumber || !code) {
      res.status(400).json({ error: "Phone number and verification code are required" });
      return;
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    const verification = await prisma.phoneVerification.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!verification) {
      res.status(400).json({ error: "No pending verification found for this phone number" });
      return;
    }

    if (verification.code !== code) {
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }

    if (new Date() > verification.expiresAt) {
      await prisma.phoneVerification.delete({ where: { phoneNumber: normalizedPhone } }).catch(() => {});
      res.status(400).json({ error: "Verification code has expired" });
      return;
    }

    await prisma.phoneVerification.delete({
      where: { phoneNumber: normalizedPhone },
    });

    let user = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phoneNumber: normalizedPhone,
        },
      });
    }

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
};

// PUT /api/auth/profile
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
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
};
