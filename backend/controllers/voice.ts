import { Response } from "express";
import { createHash } from "node:crypto";
import { prisma } from "../config/dbConnect.js";
import { AuthRequest } from "../middleware/auth.js";

export type VoiceInterpretation = {
  intent: "expense_draft" | "group_proposal" | "question";
  merchant: string | null;
  amount: number | null;
  category: "Food" | "Stay" | "Travel" | "Shopping" | "Other" | null;
  date: string | null;
  groupId: string | null;
  splitHint: string | null;
  groupName: string | null;
  memberNames: string[];
  reply: string;
};

export type VoiceGroup = { id: string; name: string };

const voiceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: "string", enum: ["expense_draft", "group_proposal", "question"] },
    merchant: { type: ["string", "null"] },
    amount: { type: ["number", "null"] },
    category: { type: ["string", "null"], enum: ["Food", "Stay", "Travel", "Shopping", "Other", null] },
    date: { type: ["string", "null"] },
    groupId: { type: ["string", "null"] },
    splitHint: { type: ["string", "null"] },
    groupName: { type: ["string", "null"] },
    memberNames: { type: "array", items: { type: "string" } },
    reply: { type: "string" },
  },
  required: ["intent", "merchant", "amount", "category", "date", "groupId", "splitHint", "groupName", "memberNames", "reply"],
};

export async function transcribeWithElevenLabs(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsKey) throw new Error("ELEVENLABS_API_KEY is not configured.");

  const audio = new FormData();
    audio.set("model_id", "scribe_v2");
  const audioBytes = new Uint8Array(buffer.byteLength);
  audioBytes.set(buffer);
  audio.set("file", new Blob([audioBytes], { type: mimeType || "audio/m4a" }), filename || "voice-note.m4a");

  const transcriptionResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": elevenLabsKey },
    body: audio,
  });
  const transcriptionPayload = await transcriptionResponse.json() as { text?: string; detail?: string; message?: string };
  if (!transcriptionResponse.ok || !transcriptionPayload.text) {
    throw new Error(transcriptionPayload.detail || transcriptionPayload.message || "ElevenLabs could not transcribe this voice note.");
  }
  return transcriptionPayload.text.trim();
}

export async function interpretExpenseTranscript(
  transcript: string,
  groups: VoiceGroup[],
  userId: string,
  previousTranscript?: string,
  followUpAttempted = false,
): Promise<VoiceInterpretation> {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const today = new Date().toISOString().slice(0, 10);
  const instructions = `You are Kryze, a decisive voice-first shared-expense co-pilot. Never execute a payment or group creation: return only structured proposals. Today is ${today}. The user belongs to these groups: ${JSON.stringify(groups)}.

For any spoken spending statement with a positive amount, ALWAYS choose expense_draft. Never ask about merchant, group, people, split, category, or date. If the merchant or purpose is unclear, set merchant to "Voice expense"; use Other for an uncertain category. Use a groupId only when the user clearly names a known group; otherwise null. If the speaker asks to split with one or more people but does not name a known group, set groupName to a short useful new group name and list those people in memberNames. Use today when no date is said, and null for an unknown split. Preserve the spoken amount. This will be logged automatically, so reply with one concise confirmation statement, never a question.

If the user asks to create, make, or start a group/shared tab, choose group_proposal. Set groupName to the requested name and memberNames to participants spoken by the user. For group_proposal, set every expense field to null and groupId to null.

Ask at most ONE clarification across this interaction. Choose question only when there is no positive amount. Its reply must be exactly: "What amount should I log?" If this is a follow-up voice note, use the earlier note and the follow-up together. Do not invent amounts, people, dates, groups, or splits.`;
  const input = previousTranscript
    ? `Earlier voice note: ${previousTranscript}\n\nFollow-up voice note: ${transcript}`
    : transcript;

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_EXPENSE_MODEL || "gpt-5",
      store: false,
      reasoning: { effort: "minimal" },
      safety_identifier: createHash("sha256").update(userId).digest("hex").slice(0, 64),
      instructions,
      input,
      text: { format: { type: "json_schema", name: "voice_expense", strict: true, schema: voiceSchema }, verbosity: "low" },
    }),
  });
  const openAiPayload = await openAiResponse.json() as {
    output_text?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    error?: { message?: string } | null;
    incomplete_details?: { reason?: string } | null;
  };
  // `output_text` is available in SDK helpers, but raw REST responses expose the
  // same text inside output[].content[].text. Support both shapes.
  const outputText = openAiPayload.output_text || openAiPayload.output
    ?.flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text!)
    .join("\n");
  if (!openAiResponse.ok || !outputText) {
    const incompleteReason = openAiPayload.incomplete_details?.reason;
    throw new Error(
      openAiPayload.error?.message ||
      (incompleteReason ? `OpenAI response was incomplete: ${incompleteReason}.` : "OpenAI could not interpret this voice note.")
    );
  }

  const interpretation = JSON.parse(outputText) as VoiceInterpretation;
  if (interpretation.groupId && !groups.some((group) => group.id === interpretation.groupId)) interpretation.groupId = null;
  if (interpretation.intent === "expense_draft" && !interpretation.merchant?.trim()) {
    interpretation.merchant = "Voice expense";
  }
  if (interpretation.amount !== null && interpretation.amount <= 0) {
    interpretation.intent = "question";
    interpretation.amount = null;
  }
  // A second incomplete note should never trap the user in a question loop.
  if (followUpAttempted && interpretation.intent === "question") {
    interpretation.reply = "I still could not hear an amount, so I did not log anything.";
  }
  return interpretation;
}

export async function interpretVoiceExpense(req: AuthRequest, res: Response): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "Record a voice note before asking Kryze." });
      return;
    }

    const transcript = await transcribeWithElevenLabs(file.buffer, file.mimetype, file.originalname);
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.userId! },
      include: { group: { select: { id: true, name: true } } },
    });
    const groups = memberships.map(({ group }) => ({ id: group.id, name: group.name }));
    const previousTranscript = typeof req.body?.previousTranscript === "string"
      ? req.body.previousTranscript.trim().slice(0, 2_000)
      : undefined;
    const followUpAttempted = req.body?.followUpAttempted === "true";
    const interpretation = await interpretExpenseTranscript(
      transcript,
      groups,
      req.userId!,
      previousTranscript || undefined,
      followUpAttempted,
    );

    res.json({ transcript, interpretation, groups });
  } catch (error: any) {
    console.error("Voice interpretation error:", error);
    res.status(500).json({ error: error.message || "Kryze could not understand that voice note." });
  }
}
