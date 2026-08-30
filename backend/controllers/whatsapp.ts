import { Request, Response } from "express";
import twilio from "twilio";
import { prisma } from "../config/dbConnect.js";
import { sendWhatsAppMessage, downloadTwilioMedia, getTwilioClient } from "../config/twilio.js";
import { extractReceipt } from "./ocr.js";
import { interpretExpenseTranscript, transcribeWithElevenLabs, VoiceInterpretation } from "./voice.js";
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
    "• /groups — your active groups",
    "• /recent — your latest shared expenses",
    "• /who — who owes you and what you owe",
    "• /remind <name> — send a gentle settle-up reminder",
    "• /newgroup <name> | <emails / phone numbers> — create a group",
    "• /help — show this message",
    "",
    "Or simply type: *paid 450 for chai with Goa Crew*",
    "Or send a receipt photo / voice note. Say *create a Goa Trip group with Riya and Aman* and reply CREATE when Kryze repeats it back.",
    "Kryze always asks before adding an expense or creating a group.",
  ].join("\n");
}

async function createGroupFromWhatsApp(userId: string, input: string): Promise<string> {
  const [rawName, rawMembers = ""] = input.split("|", 2);
  const name = rawName?.trim();
  if (!name) {
    return "Usage: */newgroup Goa Trip | riya@example.com, +919876543210*\nMembers must already have a Splitx account.";
  }
  if (name.length > 80) return "Please keep the group name under 80 characters.";

  const identifiers = rawMembers.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 15);
  const foundMembers: Array<{ id: string; name: string | null }> = [];
  const notFound: string[] = [];
  for (const identifier of identifiers) {
    const target = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier.toLowerCase() },
          { phoneNumber: identifier },
          { phoneNumber: normalizePhoneNumber(identifier) },
        ],
      },
      select: { id: true, name: true },
    });
    if (target && target.id !== userId && !foundMembers.some((member) => member.id === target.id)) {
      foundMembers.push(target);
    } else if (!target) {
      notFound.push(identifier);
    }
  }

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.group.create({ data: { name, icon: "👥" } });
    await tx.groupMember.create({ data: { groupId: created.id, userId, role: "ADMIN" } });
    if (foundMembers.length) {
      await tx.groupMember.createMany({
        data: foundMembers.map((member) => ({ groupId: created.id, userId: member.id, role: "MEMBER" })),
        skipDuplicates: true,
      });
    }
    return created;
  });

  const additions = foundMembers.length
    ? ` Added: ${foundMembers.map((member) => member.name || "a member").join(", ")}.`
    : " You're the first member.";
  const missing = notFound.length ? `\nCouldn't add yet: ${notFound.join(", ")} — they need a Splitx account first.` : "";
  return `✅ *${group.name}* is ready.${additions}${missing}\nSend a receipt, voice note, or expense message whenever you're ready.`;
}

async function queueVoiceGroupProposal(
  userId: string,
  from: string,
  interpretation: VoiceInterpretation
): Promise<void> {
  const name = interpretation.groupName?.trim();
  if (!name || name.length > 80) {
    await sendWhatsAppMessage(from, "I heard a group request, but missed a usable group name. Try: “create a Goa Trip group with Riya and Aman.”");
    return;
  }

  const requestedNames = [...new Set(interpretation.memberNames.map((member) => member.trim()).filter(Boolean))].slice(0, 15);
  const resolved: Array<{ id: string; name: string | null }> = [];
  const notFound: string[] = [];
  for (const memberName of requestedNames) {
    const user = await prisma.user.findFirst({
      where: { name: { equals: memberName, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (user && user.id !== userId && !resolved.some((member) => member.id === user.id)) {
      resolved.push(user);
    } else if (!user) {
      notFound.push(memberName);
    }
  }

  await prisma.whatsApp.update({
    where: { userId },
    data: {
      pendingDraftId: null,
      pendingGroupName: name,
      pendingGroupMemberIds: JSON.stringify(resolved.map((member) => member.id)),
      pendingGroupExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const additions = resolved.length
    ? ` I found: ${resolved.map((member) => member.name || "a member").join(", ")}.`
    : " You'll be the first member.";
  const missing = notFound.length ? ` I couldn't find yet: ${notFound.join(", ")}. They can be invited after creating a Splitx account.` : "";
  await sendWhatsAppMessage(
    from,
    `I heard: create *${name}*.${additions}${missing}\n\nReply *CREATE* within 5 minutes to make it, or *CANCEL* to discard it.`
  );
}

async function handlePendingVoiceGroupConfirmation(
  whatsapp: { userId: string; pendingGroupName: string | null; pendingGroupMemberIds: string | null; pendingGroupExpiresAt: Date | null },
  from: string,
  text: string
): Promise<boolean> {
  if (!whatsapp.pendingGroupName) return false;
  const normalized = text.trim().toLowerCase().replace(/[.!]/g, "");
  const clear = () => prisma.whatsApp.update({
    where: { userId: whatsapp.userId },
    data: { pendingGroupName: null, pendingGroupMemberIds: null, pendingGroupExpiresAt: null },
  });

  if (!whatsapp.pendingGroupExpiresAt || whatsapp.pendingGroupExpiresAt <= new Date()) {
    await clear();
    await sendWhatsAppMessage(from, "That group proposal expired. Send another voice note whenever you're ready.");
    return true;
  }
  if (["cancel", "stop", "no", "discard"].includes(normalized)) {
    await clear();
    await sendWhatsAppMessage(from, "Cancelled — no group was created.");
    return true;
  }
  if (!["create", "confirm", "yes", "go ahead", "do it"].includes(normalized)) {
    await sendWhatsAppMessage(from, `Your *${whatsapp.pendingGroupName}* group is ready for review. Reply *CREATE* or *CANCEL*.`);
    return true;
  }

  let memberIds: string[] = [];
  try {
    const parsed = JSON.parse(whatsapp.pendingGroupMemberIds || "[]");
    if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) memberIds = parsed;
  } catch {
    // A malformed proposal should still create a private group rather than fail the confirmation.
  }
  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.group.create({ data: { name: whatsapp.pendingGroupName!, icon: "👥" } });
    await tx.groupMember.create({ data: { groupId: created.id, userId: whatsapp.userId, role: "ADMIN" } });
    if (memberIds.length) {
      await tx.groupMember.createMany({
        data: memberIds.filter((id) => id !== whatsapp.userId).map((userId) => ({ groupId: created.id, userId, role: "MEMBER" })),
        skipDuplicates: true,
      });
    }
    return created;
  });
  await clear();
  await sendWhatsAppMessage(from, `✅ *${group.name}* is ready. Send a receipt, voice note, or expense message whenever you're ready.`);
  return true;
}

async function formatGroups(userId: string): Promise<string> {
  const memberships = await listUserGroups(userId);
  if (!memberships.length) return "You aren't in a Splitx group yet. Create one in the app, then come back here.";
  return ["*Your groups*", ...memberships.map((m: any, i: number) => `${i + 1}. *${m.group.name}* — ${m.group.members.length} members`)].join("\n");
}

async function formatRecentExpenses(userId: string): Promise<string> {
  const memberships = await listUserGroups(userId);
  const groupIds = memberships.map((m: any) => m.group.id);
  if (!groupIds.length) return "No groups yet, so there isn't any shared activity to show.";
  const expenses = await prisma.expense.findMany({
    where: { groupId: { in: groupIds }, status: { not: "PENDING_VERIFICATION" } },
    include: { group: { select: { name: true } }, paidBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  if (!expenses.length) return "No shared expenses yet. Send a receipt, voice note, or say what you paid to get started.";
  return [
    "*Latest shared expenses*",
    ...expenses.map((expense) => `• ${expense.group.name}: ₹${expense.amount.toFixed(2)} at *${expense.description}* — paid by ${expense.paidBy.name || "a member"}`),
  ].join("\n");
}

async function saveConversationDraft(
  userId: string,
  transcript: string,
  interpretation: VoiceInterpretation,
  source: "WhatsApp Voice" | "WhatsApp Text"
): Promise<string | null> {
  if (interpretation.intent !== "expense_draft" || !interpretation.merchant || interpretation.amount === null) return null;
  const parsedDate = interpretation.date ? new Date(interpretation.date) : new Date();
  const date = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  try {
    const draft = await prisma.transactionDraft.create({
      data: {
        userId,
        sender: source,
        messageBody: transcript,
        merchant: interpretation.merchant,
        amount: interpretation.amount,
        date,
        status: "PENDING",
      },
    });
    return draft.id;
  } catch (error) {
    console.error("Failed to save WhatsApp conversation draft:", error);
    return null;
  }
}

async function queueConversationDraft(
  userId: string,
  from: string,
  transcript: string,
  source: "WhatsApp Voice" | "WhatsApp Text"
): Promise<void> {
  const memberships = await listUserGroups(userId);
  const groups = memberships.map((m: any) => ({ id: m.group.id, name: m.group.name }));
  const interpretation = await interpretExpenseTranscript(transcript, groups, userId);
  if (interpretation.intent === "group_proposal") {
    await queueVoiceGroupProposal(userId, from, interpretation);
    return;
  }
  if (interpretation.intent !== "expense_draft" || !interpretation.merchant || interpretation.amount === null) {
    await sendWhatsAppMessage(from, interpretation.reply);
    return;
  }

  const draftId = await saveConversationDraft(userId, transcript, interpretation, source);
  if (!draftId) {
    await sendWhatsAppMessage(from, "I understood the expense, but couldn't save the review draft. Please try again.");
    return;
  }
  if (!memberships.length) {
    await sendWhatsAppMessage(from, `${interpretation.reply}\n\n📥 Saved as a review draft in your Splitx inbox. Create a group in the app when you're ready to split it.`);
    return;
  }

  await prisma.whatsApp.update({ where: { userId }, data: { pendingDraftId: draftId } });
  const suggested = interpretation.groupId ? memberships.find((m: any) => m.group.id === interpretation.groupId)?.group.name : null;
  await sendWhatsAppMessage(
    from,
    `${interpretation.reply}\n\n📥 Saved as a review draft.${suggested ? ` I think this belongs in *${suggested}*.` : ""}\n*Reply with a group name or number to confirm and add it.*\n${buildGroupPrompt(memberships)}`
  );
}

async function sendSettlementReminder(userId: string, from: string, nameQuery: string): Promise<string> {
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    include: { group: { include: { members: { include: { user: { include: { whatsapp: true } } } } } } },
  });
  const candidates = memberships.flatMap((membership: any) => membership.group.members)
    .filter((member: any) => member.userId !== userId && member.user.name?.toLowerCase().includes(nameQuery.toLowerCase()));
  const target = candidates[0];
  if (!target) return `I couldn't find *${nameQuery}* in one of your groups. Try their first name as it appears in Splitx.`;
  if (!target.user.whatsapp?.phone) return `${target.user.name || "That member"} hasn't linked WhatsApp to Splitx yet, so I can't send a private reminder.`;

  const groupIds = memberships.map((membership) => membership.group.id);
  const expenses = await prisma.expense.findMany({
    where: { groupId: { in: groupIds }, status: { not: "PENDING_VERIFICATION" } },
    include: { splits: true },
  });
  let amountOwed = 0;
  for (const expense of expenses) {
    if (expense.paidById === userId) amountOwed += expense.splits.find((split) => split.userId === target.userId)?.amount || 0;
    if (expense.paidById === target.userId) amountOwed -= expense.splits.find((split) => split.userId === userId)?.amount || 0;
  }
  if (amountOwed <= 0.01) return `I don't see an amount that ${target.user.name || nameQuery} currently owes you directly, so I didn't send a reminder.`;

  const requester = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  await sendWhatsAppMessage(target.user.whatsapp.phone, `Hi ${target.user.name || "there"} — ${requester?.name || "a Splitx member"} sent a gentle Splitx reminder. You currently owe about ₹${amountOwed.toFixed(2)} across your shared expenses. Open Splitx when you're ready to settle up. 🙌`);
  return `✓ Reminder sent to ${target.user.name || nameQuery} for approximately ₹${amountOwed.toFixed(2)}.`;
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
      const mime = payload.mediaTypes[0] || "image/jpeg";
      const isVoiceNote = mime.startsWith("audio/") || mime.includes("ogg");
      await sendWhatsAppMessage(payload.from, isVoiceNote ? "Got it! Listening to your expense note… 🎙️" : "Got it! Scanning your receipt… 🙌");
      const buffer = await downloadTwilioMedia(payload.mediaUrls[0]);
      if (!buffer) {
        await sendWhatsAppMessage(
          payload.from,
          isVoiceNote ? "Sorry, I couldn't download that voice note. Please try sending it again." : "Sorry, I couldn't download the receipt image. Please try sending it again."
        );
        return;
      }
      if (isVoiceNote) {
        try {
          const transcript = await transcribeWithElevenLabs(buffer, mime, "whatsapp-voice-note");
          await sendWhatsAppMessage(payload.from, `I heard: “${transcript}”`);
          if (await handlePendingVoiceGroupConfirmation(whatsapp, payload.from, transcript)) return;
          await queueConversationDraft(userId, payload.from, transcript, "WhatsApp Voice");
        } catch (error: any) {
          console.error("WhatsApp voice-note error:", error);
          await sendWhatsAppMessage(payload.from, "I couldn't understand that voice note. Try saying the amount, what you paid for, and optionally the group name.");
        }
        return;
      }
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

    // Voice-created groups require an explicit, short confirmation before any data is created.
    if (whatsapp.pendingGroupName && !text.startsWith("/")) {
      if (await handlePendingVoiceGroupConfirmation(whatsapp, payload.from, text)) return;
    }

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
    } else if (["/newgroup", "/creategroup", "/group"].includes(command)) {
      reply = await createGroupFromWhatsApp(userId, rest);
    } else if (["/status", "status"].includes(command)) {
      reply = await summarizeStatus(userId);
    } else if (["/groups", "groups"].includes(command)) {
      reply = await formatGroups(userId);
    } else if (["/recent", "recent"].includes(command)) {
      reply = await formatRecentExpenses(userId);
    } else if (["/who", "who", "/whoowes", "whoowes", "/settle", "settle"].includes(command)) {
      reply = await summarizeStatus(userId);
    } else if (command === "/remind" || command === "/remindme") {
      if (rest) {
        reply = await sendSettlementReminder(userId, payload.from, rest);
      } else {
        reply = `Usage: /remind <friend name>\nReply the name of who you want a settlement reminder for.`;
      }
      await prisma.botCommandLog.create({
        data: { userId, command: "/remind", payload: rest || null },
      });
    } else if (!text.startsWith("/")) {
      await queueConversationDraft(userId, payload.from, text, "WhatsApp Text");
      return;
    } else {
      reply = helpText();
    }

    if (["/newgroup", "/creategroup", "/group", "/status", "status", "/groups", "groups", "/recent", "recent", "/who", "who", "/whoowes", "whoowes", "/settle", "settle"].includes(command)) {
      await prisma.botCommandLog.create({
        data: { userId, command, payload: null },
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
