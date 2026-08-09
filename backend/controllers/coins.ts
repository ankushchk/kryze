import { Request, Response } from "express";
import { prisma } from "../config/dbConnect.js";

// Helper function to award coins to a user upon successful settlement
export async function awardCoins(userId: string, amountSettled: number, referenceId?: string): Promise<number> {
  try {
    // Earn formula: 1 coin per ₹100 settled (minimum 1 coin per settlement)
    const coinsToEarn = Math.max(1, Math.floor(amountSettled / 100));

    // Update or create CoinBalance
    const currentBalance = await prisma.coinBalance.findUnique({
      where: { userId },
    });

    const newBalance = (currentBalance?.balance || 0) + coinsToEarn;

    await prisma.coinBalance.upsert({
      where: { userId },
      update: { balance: newBalance },
      create: { userId, balance: coinsToEarn },
    });

    // Record in CoinLedger
    await prisma.coinLedger.create({
      data: {
        userId,
        amount: coinsToEarn,
        reason: "SETTLEMENT",
        referenceId,
      },
    });

    return coinsToEarn;
  } catch (error) {
    console.error("Error awarding coins:", error);
    return 0;
  }
}

// GET /api/coins/balance
export const getCoinBalance = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const coinRecord = await prisma.coinBalance.findUnique({
      where: { userId },
    });

    // Lifetime total of coins the user has collected (sum of every earned credit,
    // regardless of later redemptions) — surfaced in the profile settings.
    const totalCollected = await prisma.coinLedger.aggregate({
      where: { userId, amount: { gt: 0 } },
      _sum: { amount: true },
    });

    res.json({
      balance: coinRecord?.balance || 0,
      totalCollected: totalCollected._sum.amount || 0,
    });
  } catch (error: any) {
    console.error("Error fetching coin balance:", error);
    res.status(500).json({ error: "Failed to fetch coin balance" });
  }
};

// GET /api/coins/history
export const getCoinHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const history = await prisma.coinLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    res.json({ history });
  } catch (error: any) {
    console.error("Error fetching coin history:", error);
    res.status(500).json({ error: "Failed to fetch coin history" });
  }
};

// POST /api/coins/redeem
export const redeemCoins = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { redemptionType } = req.body;
    // Default redemption option: 50 coins = 1 month Premium
    const coinCost = 50;
    const durationDays = 30;

    const coinRecord = await prisma.coinBalance.findUnique({
      where: { userId },
    });

    const currentBalance = coinRecord?.balance || 0;
    if (currentBalance < coinCost) {
      res.status(400).json({
        error: `Insufficient coins. You need ${coinCost} coins to redeem 1 month of Premium (Current: ${currentBalance}).`,
      });
      return;
    }

    // Deduct coins
    const newBalance = currentBalance - coinCost;
    await prisma.coinBalance.update({
      where: { userId },
      data: { balance: newBalance },
    });

    // Add negative ledger entry
    await prisma.coinLedger.create({
      data: {
        userId,
        amount: -coinCost,
        reason: "REDEEMED_PREMIUM",
      },
    });

    // Extend or create Subscription
    const now = new Date();
    const existingSub = await prisma.subscription.findUnique({
      where: { userId },
    });

    let startDate = now;
    let expireDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    if (existingSub && existingSub.expiresAt && existingSub.expiresAt > now) {
      // Extend existing subscription
      expireDate = new Date(existingSub.expiresAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
      startDate = existingSub.startedAt || now;
    }

    const subscription = await prisma.subscription.upsert({
      where: { userId },
      update: {
        status: "ACTIVE",
        source: "COINS_REDEMPTION",
        expiresAt: expireDate,
      },
      create: {
        userId,
        status: "ACTIVE",
        source: "COINS_REDEMPTION",
        startedAt: startDate,
        expiresAt: expireDate,
      },
    });

    res.json({
      message: "Redemption successful! Premium unlocked for 30 days.",
      newBalance,
      subscription,
    });
  } catch (error: any) {
    console.error("Error redeeming coins:", error);
    res.status(500).json({ error: "Failed to redeem coins" });
  }
};
