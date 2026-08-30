import { Request, Response } from "express";
import { prisma } from "../config/dbConnect.js";
import { AuthRequest } from "../middleware/auth.js";
import { getTwilioClient } from "../config/twilio.js";
import twilio from "twilio";

const MAX_MESSAGE_LENGTH = 500;
const MINIMUM_LEAD_TIME_MS = 60_000;

type ElevenLabsCallResponse = {
  success?: boolean;
  message?: string;
  conversation_id?: string;
  detail?: string;
};

function callsConfigured(): boolean {
  return Boolean(
      process.env.ENABLE_ELEVENLABS_OUTBOUND_CALLS === "true" &&
      process.env.ELEVENLABS_API_KEY &&
      process.env.ELEVENLABS_AGENT_ID &&
      process.env.TWILIO_PHONE_NUMBER &&
      process.env.PUBLIC_API_URL &&
      getTwilioClient()
  );
}

function serialize(reminder: {
  id: string;
  message: string;
  phoneNumber: string;
  scheduledFor: Date;
  status: string;
  lastError: string | null;
  createdAt: Date;
}) {
  return {
    id: reminder.id,
    message: reminder.message,
    phoneNumber: reminder.phoneNumber,
    scheduledFor: reminder.scheduledFor,
    status: reminder.status,
    lastError: reminder.lastError,
    createdAt: reminder.createdAt,
  };
}

// POST /api/call-reminders
// A call can only ever target the signed-in user's verified account number.
export async function createCallReminder(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId;
  const { message, scheduledFor, callConsent } = req.body as {
    message?: unknown;
    scheduledFor?: unknown;
    callConsent?: unknown;
  };

  if (!userId || !req.user?.phoneNumber) {
    res.status(400).json({ error: "Add and verify a phone number before scheduling a call reminder." });
    return;
  }
  if (!callsConfigured()) {
    res.status(503).json({ error: "Voice call reminders are not available yet." });
    return;
  }
  if (callConsent !== true) {
    res.status(400).json({ error: "Call reminders require explicit opt-in consent." });
    return;
  }
  if (typeof message !== "string" || !message.trim() || message.trim().length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: `Reminder text is required and must be ${MAX_MESSAGE_LENGTH} characters or fewer.` });
    return;
  }
  if (typeof scheduledFor !== "string") {
    res.status(400).json({ error: "scheduledFor must be an ISO-8601 date and time." });
    return;
  }

  const dueAt = new Date(scheduledFor);
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() < Date.now() + MINIMUM_LEAD_TIME_MS) {
    res.status(400).json({ error: "Schedule the call at least one minute in the future." });
    return;
  }

  const reminder = await prisma.voiceCallReminder.create({
    data: {
      userId,
      phoneNumber: req.user.phoneNumber,
      message: message.trim(),
      scheduledFor: dueAt,
    },
  });
  res.status(201).json({ reminder: serialize(reminder) });
}

// GET /api/call-reminders
export async function listCallReminders(req: AuthRequest, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const reminders = await prisma.voiceCallReminder.findMany({
    where: { userId: req.userId },
    orderBy: { scheduledFor: "asc" },
    take: 50,
  });
  res.json({ reminders: reminders.map(serialize), callsEnabled: callsConfigured() });
}

// DELETE /api/call-reminders/:id
export async function cancelCallReminder(req: AuthRequest, res: Response): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const reminderId = req.params.id;
  if (typeof reminderId !== "string") {
    res.status(400).json({ error: "Invalid reminder id." });
    return;
  }
  const result = await prisma.voiceCallReminder.updateMany({
    where: { id: reminderId, userId: req.userId, status: "SCHEDULED" },
    data: { status: "CANCELLED" },
  });
  if (!result.count) {
    res.status(404).json({ error: "No scheduled reminder found to cancel." });
    return;
  }
  res.status(204).send();
}

async function startTwilioCall(reminder: { id: string; phoneNumber: string }): Promise<string | null> {
  const publicApiUrl = process.env.PUBLIC_API_URL!.replace(/\/$/, "");
  const callbackUrl = `${publicApiUrl}/api/call-reminders/twilio/outbound?reminderId=${encodeURIComponent(reminder.id)}`;
  const call = await getTwilioClient().calls.create({
    to: reminder.phoneNumber,
    from: process.env.TWILIO_PHONE_NUMBER,
    url: callbackUrl,
    method: "POST",
  });
  return call.sid || null;
}

function validTwilioWebhook(req: Request): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.header("x-twilio-signature");
  if (!authToken || !signature) return false;
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  return twilio.validateRequest(authToken, signature, url, req.body);
}

// POST /api/call-reminders/twilio/outbound?reminderId=...
// Twilio requests this after it starts an outbound call. ElevenLabs returns the TwiML
// that connects the live call to the configured agent without replacing Twilio's
// existing inbound voice webhook.
export async function connectTwilioReminderCall(req: Request, res: Response): Promise<void> {
  if (!validTwilioWebhook(req)) {
    res.status(403).send("Forbidden");
    return;
  }
  const reminderId = req.query.reminderId;
  if (typeof reminderId !== "string") {
    res.status(400).send("Missing reminder id");
    return;
  }
  const reminder = await prisma.voiceCallReminder.findFirst({
    where: { id: reminderId, status: { in: ["PROCESSING", "SENT"] } },
    include: { user: { select: { name: true } } },
  });
  if (!reminder) {
    res.status(404).send("Reminder not found");
    return;
  }

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/register-call", {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: process.env.ELEVENLABS_AGENT_ID,
        from_number: req.body.From,
        to_number: req.body.To,
        direction: "outbound",
        conversation_initiation_client_data: {
          dynamic_variables: {
            user_name: reminder.user.name || "there",
            reminder_text: reminder.message,
            reminder_id: reminder.id,
          },
        },
      }),
    });
    const twiml = await response.text();
    if (!response.ok || !twiml) throw new Error(twiml || "ElevenLabs did not return call instructions.");
    res.type("text/xml").send(twiml);
  } catch (error: any) {
    console.error("ElevenLabs reminder call connection failed", { reminderId, error: error?.message || error });
    res.type("text/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>");
  }
}

// POST /api/call-reminders/dispatch
// Invoke once per minute from a platform cron job. It is deliberately not run in-process,
// so deploying multiple API instances cannot duplicate calls.
export async function dispatchDueReminders(): Promise<{ checked: number; dispatched: number; failed: number }> {
  if (!callsConfigured()) {
    throw new Error("Outbound calls are disabled or not configured.");
  }

  const due = await prisma.voiceCallReminder.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: new Date() } },
    include: { user: { select: { name: true } } },
    orderBy: { scheduledFor: "asc" },
    take: 25,
  });
  let dispatched = 0;
  let failed = 0;

  for (const reminder of due) {
    // Claim this reminder atomically before making an external call.
    const claim = await prisma.voiceCallReminder.updateMany({
      where: { id: reminder.id, status: "SCHEDULED" },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
    if (!claim.count) continue;

    try {
      const conversationId = await startTwilioCall(reminder);
      await prisma.voiceCallReminder.update({
        where: { id: reminder.id },
        data: { status: "SENT", providerConversationId: conversationId, dispatchedAt: new Date(), lastError: null },
      });
      dispatched += 1;
    } catch (error: any) {
      const message = String(error?.message || "Unable to place reminder call.").slice(0, 1000);
      console.error("Call reminder dispatch failed", { reminderId: reminder.id, error: message });
      await prisma.voiceCallReminder.update({
        where: { id: reminder.id },
        data: { status: "FAILED", lastError: message },
      });
      failed += 1;
    }
  }

  return { checked: due.length, dispatched, failed };
}

export async function dispatchDueCallReminders(req: AuthRequest, res: Response): Promise<void> {
  const cronSecret = process.env.CALL_REMINDER_CRON_SECRET;
  if (!cronSecret || req.header("x-call-reminder-cron-secret") !== cronSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    res.json(await dispatchDueReminders());
  } catch (error: any) {
    res.status(503).json({ error: error?.message || "Outbound calls are disabled or not configured." });
  }
}
