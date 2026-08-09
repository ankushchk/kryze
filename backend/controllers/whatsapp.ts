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
    "",
    "Send a receipt photo to:",
    "1. Get an itemized split back",
    "2. Pick a group to add it to (equal split)",
    "3. It's saved to your app inbox either way",
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

// Save an OCR'd WhatsApp receipt as a PENDING draft so it shows up in the app inbox.
async function saveReceiptDraft(userId: string, data: any): Promise<string | null> {
  try {
    const merchant = (data.merchant || "Unknown Merchant").trim();
    const amount = typeof data.amount === "number" && !isNaN(data.amount) ? data.amount : 0;
    const parsedDate = new Date(data.date);
    const date = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
    const messageBody = `WhatsApp receipt from ${merchant}`;

    const draft = await prisma.transactionDraft.upsert({
      where: {
        userId_sender_messageBody_date: {
          userId,
          sender: "WhatsApp",
          messageBody,
          date,
        },
      },
      update: { merchant, amount, status: "PENDING" },
      create: {
        userId,
        sender: "WhatsApp",
        messageBody,
        merchant,
        amount,
        date,
        status: "PENDING",
      },
    });
    return draft.id;
  } catch (error) {
    console.error("Failed to save WhatsApp receipt draft:", error);
    return null;
  }
}

// The user's groups (with member counts) for the "which group?" prompt.
async function listUserGroups(userId: string) {
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    include: {
      group: {
        include: { members: { select: { userId: true } } },
      },
    },
    orderBy: { joinedAt: "asc" },
  });
  return memberships;
}

function buildGroupPrompt(memberships: any[]): string {
  if (memberships.length === 0) {
    return "You're not in any group yet. Create a group in the app first, then send the receipt again.";
  }
  const lines = memberships.map((m, i) => `${i + 1}. ${m.group.name} (${m.group.members.length} members)`);
  return lines.join("\n") + "\n\nReply with the number or name, or *cancel*.";
}

// Create an expense from a PENDING WhatsApp draft, split equally across the group.
async function createReceiptExpense(
  userId: string,
  draftId: string,
  group: any,
  from: string
): Promise<string> {
  const draft = await prisma.transactionDraft.findUnique({ where: { id: draftId } });
  if (!draft || draft.userId !== userId || draft.status !== "PENDING") {
    return "That receipt is no longer pending. Please send the photo again.";
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId: group.id },
    include: { user: { select: { id: true, name: true } } },
  });

  if (members.length === 0) {
    return `Group "${group.name}" has no members to split with.`;
  }

  const amount = draft.amount || 0;
  const base = Math.floor((amount / members.length) * 100) / 100;
  const remainder = Math.round((amount - base * members.length) * 100) / 100;

  const splits = members.map((m: any, i: number) => {
    const amt = i === members.length - 1 ? base + remainder : base;
    return { userId: m.user.id, amount: Math.round(amt * 100) / 100, name: m.user.name || "Unknown" };
  });

  await prisma.expense.create({
    data: {
      groupId: group.id,
      paidById: userId,
      description: draft.merchant || "WhatsApp receipt",
      amount,
      date: draft.date,
      status: "APPROVED",
      splits: { create: splits.map((s) => ({ userId: s.userId, amount: s.amount })) },
    },
  });

  await prisma.transactionDraft.update({ where: { id: draftId }, data: { status: "ADDED" } });
  await prisma.whatsApp.update({ where: { userId }, data: { pendingDraftId: null } });

  const lines = splits.map((s) => `• ${s.name} — ₹${s.amount.toFixed(2)}`);
  return [
    `✅ Added ₹${amount.toFixed(2)} at ${draft.merchant} to *${group.name}*.`,
    `Split equally among ${members.length} members:`,
    lines.join("\n"),
    "Open the app to see it in the group.",
  ].join("\n");
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
        const draftId = await saveReceiptDraft(userId, data);
        const reply = await formatReceiptReply(data);

        if (!draftId) {
          await sendWhatsAppMessage(
            payload.from,
            reply +
              "\n\n⚠️ I couldn't save this to your inbox. You can still add it manually in the app."
          );
          return;
        }

        const memberships = await listUserGroups(userId);
        if (memberships.length === 0) {
          await prisma.whatsApp.update({
            where: { userId },
            data: { pendingDraftId: null },
          });
          await sendWhatsAppMessage(
            payload.from,
            reply +
              "\n\n✅ Saved to your Splitx inbox, but you're not in any group yet. Create a group in the app and I can add it then."
          );
          return;
        }

        await prisma.whatsApp.update({
          where: { userId },
          data: { pendingDraftId: draftId },
        });

        await sendWhatsAppMessage(
          payload.from,
          reply + "\n\n📥 Saved to your inbox!\n*Which group should I add this to?*\n" + buildGroupPrompt(memberships)
        );
      } catch (error: any) {
        console.error("WhatsApp OCR error:", error);
        await sendWhatsAppMessage(
          payload.from,
          "I couldn't read that receipt. Make sure the image is clear, or try uploading it in the Splitx app instead."
        );
      }
      return;
    }

    const text = (payload.body || "").trim();

    // If we're awaiting a group choice for a saved draft, resolve it first (unless it's a command).
    if (whatsapp.pendingDraftId && !text.startsWith("/")) {
      const lower = text.toLowerCase();
      if (["cancel", "skip", "stop", "no"].includes(lower)) {
        await prisma.whatsApp.update({
          where: { userId },
          data: { pendingDraftId: null },
        });
        await sendWhatsAppMessage(
          payload.from,
          "OK, I've left it in your inbox as a pending draft. You can add it to a group from the app."
        );
        return;
      }

      const memberships = await listUserGroups(userId);
      const num = parseInt(text, 10);
      let chosen = !isNaN(num) && num >= 1 && num <= memberships.length ? memberships[num - 1] : null;
      if (!chosen) {
        chosen =
          memberships.find(
            (m) =>
              m.group.name.toLowerCase().includes(lower) ||
              lower.includes(m.group.name.toLowerCase())
          ) || null;
      }

      if (!chosen) {
        await sendWhatsAppMessage(
          payload.from,
          "I didn't catch that. Reply with the group *number* or *name* from the list, or *cancel*."
        );
        return;
      }

      const result = await createReceiptExpense(userId, whatsapp.pendingDraftId, chosen.group, payload.from);
      await sendWhatsAppMessage(payload.from, result);
      return;
    }

    const command = text.split(/\s+/)[0].toLowerCase();
    const rest = text.replace(command, "").trim();

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