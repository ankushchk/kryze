import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const smsNumber = process.env.TWILIO_PHONE_NUMBER;
// Twilio sandbox number is used for WhatsApp when no dedicated sender is configured.
const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

export function getTwilioClient(): any {
  return twilioClient;
}

export function isTwilioConfigured(): boolean {
  return Boolean(twilioClient && smsNumber);
}

// Send an SMS (used for phone OTPs). Throws if not configured.
export async function sendSms(to: string, body: string) {
  if (!twilioClient || !smsNumber) {
    throw new Error("Twilio SMS is not configured");
  }
  return twilioClient.messages.create({ to, from: smsNumber, body });
}

// Send a WhatsApp message. Throws if no WhatsApp sender is available.
export async function sendWhatsAppMessage(to: string, body: string) {
  if (!twilioClient || !whatsappFrom) {
    throw new Error("Twilio WhatsApp is not configured");
  }
  return twilioClient.messages.create({ to: `whatsapp:${to}`, from: whatsappFrom, body });
}

// Download Twilio-hosted media (e.g. a receipt photo sent to the bot).
export async function downloadTwilioMedia(mediaUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(mediaUrl, {
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      },
    });
    if (!res.ok) {
      console.error("Failed to download Twilio media:", res.status, mediaUrl);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (error: any) {
    console.error("Twilio media download error:", error.message || error);
    return null;
  }
}