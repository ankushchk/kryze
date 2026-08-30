import { Request, Response } from 'express';
import { uploadToCloudinary } from '../config/cloudinary.js';

// Shared receipt OCR that both the multer route and the WhatsApp bot call.
// Returns the parsed OpenAI payload merged with the Cloudinary receipt URL (may be null).
export async function extractReceipt(
  buffer: Buffer,
  mimeType: string
): Promise<{ receiptUrl: string | null; [key: string]: any }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured on the backend server');
  }

  // Store the original receipt before extracting its structured details.
  const receiptUrl = await uploadToCloudinary(buffer);

  // Some mobile clients send .jpg files as `image/jpg`, but OpenAI accepts
  // the standard `image/jpeg` type instead.
  const normalizedMimeType = mimeType.toLowerCase() === 'image/jpg'
    ? 'image/jpeg'
    : mimeType;

  // Convert file buffer to base64 inline data format
  const base64Data = buffer.toString('base64');

  // Keep the model configurable without a code deployment. It deliberately
  // defaults to the same OpenAI family already used by the voice co-pilot.
  const receiptModel = process.env.OPENAI_RECEIPT_MODEL || process.env.OPENAI_EXPENSE_MODEL || 'gpt-5';

  const prompt = `You are Kryze's receipt intelligence engine. Read this receipt image carefully and return only the requested structured data.

Extraction rules:
- Use the final payable GRAND TOTAL / TOTAL AMOUNT, never a subtotal, tax, discount, change due, card balance, or UPI balance.
- Include taxes, service charges, delivery fees, and tip only when they are part of the final amount paid.
- Extract printed line items only. Do not invent unclear items or prices.
- For each line item, return its line total (unit price multiplied by quantity). Use quantity 1 when it is not printed.
- Use the transaction date printed on the receipt; if it is absent or unreadable, return an empty string.
- Pick the most suitable category from the allowed values. Use Other when uncertain.
- Preserve merchant spelling when readable; otherwise use "Unknown Merchant".

Return a structured JSON object. Amounts and item prices must be numbers and dates must be YYYY-MM-DD when present.`;

  const receiptSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      merchant: { type: 'string' },
      amount: { type: 'number' },
      date: { type: 'string' }, // YYYY-MM-DD, or empty when unavailable
      category: { type: 'string', enum: ['Food', 'Stay', 'Travel', 'Shopping', 'Other'] },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            quantity: { type: 'number' },
            price: { type: 'number' },
          },
          required: ['name', 'quantity', 'price'],
        },
      },
    },
    required: ['merchant', 'amount', 'date', 'category', 'items'],
  };

  const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: receiptModel,
      store: false,
      reasoning: { effort: 'minimal' },
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: `data:${normalizedMimeType};base64,${base64Data}`, detail: 'high' },
        ],
      }],
      text: { format: { type: 'json_schema', name: 'receipt', strict: true, schema: receiptSchema } },
    }),
  });
  const openAiPayload = await openAiResponse.json() as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    error?: { message?: string } | null;
    incomplete_details?: { reason?: string } | null;
  };
  const responseText = openAiPayload.output_text || openAiPayload.output
    ?.flatMap((item) => item.content || [])
    .filter((content) => content.type === 'output_text' && typeof content.text === 'string')
    .map((content) => content.text!)
    .join('\n');
  if (!openAiResponse.ok || !responseText) {
    const incompleteReason = openAiPayload.incomplete_details?.reason;
    throw new Error(
      openAiPayload.error?.message ||
      (incompleteReason ? `OpenAI receipt analysis was incomplete: ${incompleteReason}.` : 'OpenAI returned an empty receipt analysis.')
    );
  }

  const parsedData = JSON.parse(responseText);

  return {
    ...parsedData,
    receiptUrl,
  };
}

export const processReceiptOCR = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No receipt image file uploaded' });
      return;
    }

    const data = await extractReceipt(file.buffer, file.mimetype);

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('OCR Processing Error:', error);
    res.status(500).json({ 
      error: 'Failed to process receipt image', 
      details: error.message || error 
    });
  }
};
