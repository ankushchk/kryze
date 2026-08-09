import { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { uploadToCloudinary } from '../config/cloudinary.js';

// Shared receipt OCR that both the multer route and the WhatsApp bot call.
// Returns the parsed Gemini payload merged with the Cloudinary receipt URL (may be null).
export async function extractReceipt(
  buffer: Buffer,
  mimeType: string
): Promise<{ receiptUrl: string | null; [key: string]: any }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the backend server');
  }

  // Trigger Cloudinary upload in parallel or prior to Gemini to get secure URL
  const receiptUrl = await uploadToCloudinary(buffer);

  const ai = new GoogleGenAI({ apiKey });

  // Convert file buffer to base64 inline data format
  const base64Data = buffer.toString('base64');

  const prompt = `Analyze this receipt image. Extract the merchant name, total amount, transaction date, categorization, and the individual line items.
For each line item, extract the name/description, quantity (default to 1 if not specified), and the total price for that line item (i.e. unit price multiplied by quantity).
Return a structured JSON object. Ensure total amount and item prices are numbers, and date is formatted as YYYY-MM-DD.`;
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      },
      prompt,
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          merchant: { type: 'STRING' },
          amount: { type: 'NUMBER' },
          date: { type: 'STRING' }, // YYYY-MM-DD
          category: { 
            type: 'STRING', 
            enum: ['Food', 'Stay', 'Travel', 'Shopping', 'Other'] 
          },
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                quantity: { type: 'NUMBER' },
                price: { type: 'NUMBER' }
              },
              required: ['name', 'quantity', 'price']
            }
          }
        },
        required: ['merchant', 'amount', 'date', 'category', 'items'],
      },
    },
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error('Gemini API returned an empty response');
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
