import { Request, Response } from "express";
import { prisma } from "../config/dbConnect.js";

// GET /api/premium/status
export const getPremiumStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      res.json({ status: "INACTIVE", isPremium: false });
      return;
    }

    const now = new Date();
    const isExpired = subscription.expiresAt && subscription.expiresAt < now;
    const isPremium = subscription.status === "ACTIVE" && !isExpired;

    res.json({
      status: isExpired ? "EXPIRED" : subscription.status,
      isPremium,
      source: subscription.source,
      expiresAt: subscription.expiresAt,
    });
  } catch (error: any) {
    console.error("Error fetching premium status:", error);
    res.status(500).json({ error: "Failed to fetch premium status" });
  }
};
