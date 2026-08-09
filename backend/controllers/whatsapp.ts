import { Request, Response } from "express";
import twilio from "twilio";
import { prisma } from "../config/dbConnect.js";
import { sendWhatsAppMessage, downloadTwilioMedia, getTwilioClient } from "../config/twilio.js";
import { extractReceipt } from "./ocr.js";
import { normalizePhoneNumber } from "./auth.js";
import { AuthRequest } from "../middleware/auth.js";

const WEBHOOK_VERIFY_DISABLED = process.env.DISABLE_TWILIO_SIGNATURE === "true";

function twiML(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${text.replace(
    /[<>&]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string)
  )}</Message></Response>`;
}

export function verifyWebhookSignature(req: Request): boolean {
  if (WEBHOOK_VERIFY_DISABLED) return true;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.header("x-twilio-signature");
  if (!authToken || !signature) return false;
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  return twilio.validateRequest(authToken, signature, url, req.body);
}

async function isPremiumUser(userId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub || sub.status !== "ACTIVE" || !sub.expiresAt) return false;
  return sub.expiresAt > new Date();
}

// GET /api/whatsapp/status
export const getLinkStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const whatsapp = await prisma.whatsApp.findUnique({ where: { userId } });
    res.json({
      linked: Boolean(whatsapp),
      phone: whatsapp?.phone || null,
      linkedAt: whatsapp?.linkedAt || null,
    });
  } catch (error: any) {
    console.error("Error fetching WhatsApp link status:", error);
    res.status(500).json({ error: "Failed to fetch WhatsApp link status" });
  }
};

// POST /api/whatsapp/send-code — send an OTP code to the user's WhatsApp
export const sendWhatsAppCode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { phoneNumber } = req.body;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
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

    const isMockNumber = normalizedPhone.includes("00000") || normalizedPhone.includes("12345");

    if (getTwilioClient() && !isMockNumber) {
      try {
        await sendWhatsAppMessage(
          normalizedPhone,
          `Your SplitX WhatsApp code is: ${code}. It expires in 5 minutes. Reply within the app to link your WhatsApp.`
        );
        console.log(`WhatsApp code sent to ${normalizedPhone}`);
      } catch (waError: any) {
        console.error("Failed to send WhatsApp code via Twilio:", waError);
        if (process.env.NODE_ENV !== "production") {
          console.log(`\n--- [WHATSAPP OTP FALLBACK LOG] ---`);
          console.log(`To: ${normalizedPhone}`);
          console.log(`Code: ${code}`);
          console.log(`-----------------------------------\n`);
        } else {
          res.status(500).json({ error: "Failed to send WhatsApp verification code" });
          return;
        }
      }
    } else {
      console.log(`\n--- [WHATSAPP OTP FALLBACK LOG (MOCK/SIMULATOR)] ---`);
      console.log(`To: ${normalizedPhone}`);
      console.log(`Code: ${code}`);
      console.log(`----------------------------------------------------\n`);
    }

    res.json({ message: "WhatsApp verification code sent" });
  } catch (error: any) {
    console.error("Send WhatsApp code error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /api/whatsapp/link — verify the OTP and link this user's WhatsApp
export const linkWhatsapp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { phoneNumber, code } = req.body;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
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
      await prisma.phoneVerification
        .delete({ where: { phoneNumber: normalizedPhone } })
        .catch(() => {});
      res.status(400).json({ error: "Verification code has expired" });
      return;
    }

    await prisma.phoneVerification.delete({
      where: { phoneNumber: normalizedPhone },
    });

    // If the phone is already linked to a different account, re-link it to this user.
    await prisma.whatsApp.deleteMany({
      where: { phone: normalizedPhone, NOT: { userId } },
    });

    const whatsapp = await prisma.whatsApp.upsert({
      where: { userId },
      update: { phone: normalizedPhone },
      create: { userId, phone: normalizedPhone },
    });

    res.json({ message: "WhatsApp linked successfully", whatsapp });
  } catch (error: any) {
    console.error("Link whatsapp error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /api/whatsapp/unlink
export const unlinkWhatsapp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    await prisma.whatsApp
      .delete({ where: { userId } })
      .catch(() => {});
    res.json({ message: "WhatsApp unlinked" });
  } catch (error: any) {
    console.error("Unlink whatsapp error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Build a per-user balance summary across all their groups.
async function summarizeStatus(userId: string): Promise<string> {
  const memberships = (await prisma.groupMember.findMany({
    where: { userId },
    include: {
      group: {
        include: {
          members: true,
          expenses: {
            include: { splits: true },
          },
        },
      },
    },
  })) as any;

  if (memberships.length === 0) {
    return "You're not part of any Splitx groups yet.";
  }

  const lines: string[] = [];
  let owedToUser = 0;
  let owedByUser = 0;

  for (const membership of memberships) {
    const group = membership.group;
    const balances: Record<string, number> = {};
    group.members.forEach((m: any) => {
      balances[m.userId] = 0;
    });
    group.expenses.forEach((expense: any) => {
      if (expense.status === "PENDING_VERIFICATION") return;
      if (balances[expense.paidById] !== undefined) {
        balances[expense.paidById] += expense.amount;
      }
      expense.splits.forEach((split: any) => {
        if (balances[split.userId] !== undefined) {
          balances[split.userId] -= split.amount;
        }
      });
    });

    const balance = Number((balances[userId] || 0).toFixed(2));
    if (Math.abs(balance) < 0.01) continue;

    if (balance > 0) {
      owedToUser += balance;
      lines.push(`• ${group.name}: You are owed ₹${balance.toFixed(2)}`);
    } else {
      owedByUser += Math.abs(balance);
      lines.push(`• ${group.name}: You owe ₹${Math.abs(balance).toFixed(2)}`);
    }
  }

  if (lines.length === 0) {
    return "All settled up! No outstanding balances in any group. 🎉";
  }

  const totalLines = [];
  if (owedToUser > 0.01) totalLines.push(`📥 You are owed ₹${owedToUser.toFixed(2)} in total`);
  if (owedByUser > 0.01) totalLines.push(`📤 You owe ₹${owedByUser.toFixed(2)} in total`);

  return lines.join("\n") + (totalLines.length ? "\n\n" + totalLines.join("\n") : "");
}

function helpText(): string {
  return [
    "*Splitx WhatsApp Bot*",
    "Available commands:",
    "• /status — your group balances across all tabs",
    "• /help — show this message",
    "• /remind <name> — request a settle-up reminder huddle (coming soon)",
    "You can also forward a receipt: send a photo of a bill and get an itemized split back.",
  ].join("\n");
}

async function formatReceiptReply(data: any): Promise<string> {
  const amount = data.amount != null ? `₹${Number(data.amount).toFixed(2)}` : "—";
  let text = `🧾 ${data.merchant || "Receipt"}\nTotal: ${amount}`;
  if (data.date) text += `\nDate: ${data.date}`;
  if (data.category) text += ` • ${data.category}`;

  if (Array.isArray(data.items) && data.items.length > 0) {
    text += `\n\nLines:`;
    data.items.forEach((item: any) => {
      const qty = item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : "";
      text += `\n• ${item.name}${qty} — ₹${Number(item.price || 0).toFixed(2)}`;
    });
  }
  return text;
}

async function handleIncoming(payload: {
  from: string;
  body: string;
  numMedia: number;
  mediaUrls: string[];
  mediaTypes: string[];
}): Promise<void> {
  try {
    const whatsapp = await prisma.whatsApp.findUnique({ where: { phone: payload.from } });
    if (!whatsapp) {
      await sendWhatsAppMessage(
        payload.from,
        "This WhatsApp number isn't linked to Splitx. Open the Splitx app → Profile Settings → WhatsApp Bot → Link, and enter your phone number to get started."
      );
      return;
    }

    const userId = whatsapp.userId;

    if (payload.numMedia > 0 && payload.mediaUrls[0]) {
      await sendWhatsAppMessage(payload.from, "Got it! Scanning your receipt… 🙌");
      const buffer = await downloadTwilioMedia(payload.mediaUrls[0]);
      if (!buffer) {
        await sendWhatsAppMessage(
          payload.from,
          "Sorry, I couldn't download the receipt image. Please try sending it again."
        );
        return;
      }
      const mime = payload.mediaTypes[0] || "image/jpeg";
      try {
        const data = await extractReceipt(buffer, mime);
        const reply = await formatReceiptReply(data);
        await sendWhatsAppMessage(payload.from, reply);
      } catch (error: any) {
        console.error("WhatsApp OCR error:", error);
        await sendWhatsAppMessage(
          payload.from,
          "I couldn't read that receipt. Make sure the image is clear, or try uploading it in the Splitx app instead."
        );
      }
      return;
    }

    const command = (payload.body || "").trim().split(/\s+/)[0].toLowerCase();
    const rest = (payload.body || "").trim().replace(command, "").trim();

    let reply: string;
    if (["/help", "help", "/start"].includes(command)) {
      reply = helpText();
    } else if (["/status", "status"].includes(command)) {
      reply = await summarizeStatus(userId);
    } else if (command === "/remind" || command === "/remindme") {
      if (rest) {
        reply = `✓ Noted! We'll nudge ${rest} for you soon. Real-time settle-up reminders arrive in the next Update.`;
      } else {
        reply = `Usage: /remind <friend name>\nReply the name of who you want a settlement reminder for.`;
      }
      await prisma.botCommandLog.create({
        data: { userId, command: "/remind", payload: rest || null },
      });
    } else {
      reply = helpText();
    }

    if (["/status", "status"].includes(command)) {
      await prisma.botCommandLog.create({
        data: { userId, command: "/status", payload: null },
      });
    }

    await sendWhatsAppMessage(payload.from, reply);
  } catch (error: any) {
    console.error("WhatsApp webhook handling error:", error);
    try {
      await sendWhatsAppMessage(payload.from, "Something went wrong on our end. Please try again later.");
    } catch (_e: any) {}
  }
}

// POST /api/whatsapp/webhook
export const whatsappWebhook = async (req: Request, res: Response): Promise<void> => {
  if (!verifyWebhookSignature(req)) {
    res.status(403).send(twiML("Request signature invalid."));
    return;
  }

  const fromRaw = typeof req.body.From === "string" ? req.body.From : "";
  const from = fromRaw.replace(/^whatsapp:/, "");

  if (!from) {
    res.status(400).send(twiML("Missing From."));
    return;
  }

  const numMedia = parseInt(req.body.NumMedia || "0", 10) || 0;
  const mediaUrls: string[] = [];
  const mediaTypes: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const url = req.body[`MediaUrl${i}`];
    if (url) {
      mediaUrls.push(url);
      mediaTypes.push(req.body[`MediaContentType${i}`] || "image/jpeg");
    }
  }

  const body = typeof req.body.Body === "string" ? req.body.Body : "";

  res.type("text/xml");
  if (numMedia > 0) {
    res.status(200).send(twiML("Receiving your receipt…"));
  } else {
    res.status(200).send(twiML("Processing…"));
  }

  void handleIncoming({ from, body, numMedia, mediaUrls, mediaTypes });
};