import { Request, Response } from "express";
import { prisma } from "../config/dbConnect.js";
import { AuthRequest } from "../middleware/auth.js";

// Server-side parsing helper for raw SMS syncs (e.g. from iOS Shortcut)
export function parseSms(body: string): { merchant: string; amount: number } {
  const cleanBody = body.toLowerCase();
  
  // 1. Amount Extraction
  let amount = 0;
  // Patterns like Rs. 500, Rs 500, INR 500.00, Rs.500
  const amountRegexes = [
    /(?:rs\.?|inr|spent)\s*([0-9,]+(?:\.[0-9]+)?)/i,
    /debited\s*(?:by|of)?\s*(?:rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]+)?)/i
  ];
  
  for (const regex of amountRegexes) {
    const match = body.match(regex);
    if (match && match[1]) {
      const parsed = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(parsed)) {
        amount = parsed;
        break;
      }
    }
  }

  // 2. Merchant Extraction
  let merchant = "Unknown Merchant";
  const merchantRegexes = [
    /(?:at|to|vpa|into|info|for)\s+([a-z0-9\s\-_&.*#@]+?)(?:\s+on|\s+using|\s+via|\s+with|\s+ref|\s+upi|\s+for|\s+from|\s+balance|\s+date|\s+\.|$)/i
  ];
  
  for (const regex of merchantRegexes) {
    const match = body.match(regex);
    if (match && match[1]) {
      let candidate = match[1].trim();
      
      if (candidate.includes("@")) {
        candidate = candidate.split("@")[0];
      }
      
      candidate = candidate.replace(/a\/c\s*x*/gi, "");
      candidate = candidate.replace(/xx[0-9]*/gi, "");
      candidate = candidate.replace(/acct\s*x*/gi, "");
      candidate = candidate.replace(/[^a-zA-Z0-9]+$/, "").trim();
      
      candidate = candidate.split(" ")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");

      if (candidate.length > 0 && candidate.length < 40) {
        merchant = candidate;
        break;
      }
    }
  }

  return { merchant, amount };
}

// POST /api/drafts
export const createDraft = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sender, messageBody, merchant, amount, date, status } = req.body;
    if (!sender || !messageBody || !merchant || amount === undefined || !date || !status) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const userId = req.userId!;

    const result = await prisma.transactionDraft.upsert({
      where: {
        userId_sender_messageBody_date: {
          userId,
          sender: sender.trim(),
          messageBody: messageBody.trim(),
          date: new Date(date),
        },
      },
      update: {
        merchant: merchant.trim(),
        amount: parseFloat(amount),
        status,
      },
      create: {
        userId,
        sender: sender.trim(),
        messageBody: messageBody.trim(),
        merchant: merchant.trim(),
        amount: parseFloat(amount),
        date: new Date(date),
        status,
      },
    });

    res.status(201).json({ draft: result });
  } catch (error: any) {
    console.error("Error creating draft:", error);
    res.status(500).json({ error: error.message || "Failed to create draft" });
  }
};

// GET /api/drafts
export const getDrafts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const drafts = await prisma.transactionDraft.findMany({
      where: { userId },
      orderBy: { date: "desc" },
    });
    res.json({ drafts });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to retrieve drafts" });
  }
};

// PATCH /api/drafts/:id
export const updateDraft = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const id = req.params.id as string;
    const status = req.body.status as string | undefined;
    const merchant = req.body.merchant as string | undefined;
    const amount = req.body.amount;

    const draft = await prisma.transactionDraft.findUnique({
      where: { id },
    });

    if (!draft || draft.userId !== userId) {
      res.status(404).json({ error: "Transaction draft not found" });
      return;
    }

    const updated = await prisma.transactionDraft.update({
      where: { id },
      data: {
        status: status || undefined,
        merchant: merchant || undefined,
        amount: amount !== undefined ? parseFloat(amount) : undefined,
      },
    });

    res.json({ draft: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update draft" });
  }
};
