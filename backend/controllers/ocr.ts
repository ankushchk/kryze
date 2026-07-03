import { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { uploadToCloudinary } from '../config/cloudinary.js';

export const processReceiptOCR = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No receipt image file uploaded' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the backend server' });
      return;
    }

    // Trigger Cloudinary upload in parallel or prior to Gemini to get secure URL
    const receiptUrl = await uploadToCloudinary(file.buffer);

    const ai = new GoogleGenAI({ apiKey });

    // Convert file buffer to base64 inline data format
    const base64Data = file.buffer.toString('base64');

    const prompt = `Analyze this receipt image. Extract the merchant name, total amount, transaction date, and categorization.
Return a structured JSON object. Ensure amount is a number and date is formatted as YYYY-MM-DD.`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: file.mimetype,
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
          },
          required: ['merchant', 'amount', 'date', 'category'],
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Gemini API returned an empty response');
    }

    const parsedData = JSON.parse(responseText);

    res.json({
      success: true,
      data: {
        ...parsedData,
        receiptUrl,
      },
    });
  } catch (error: any) {
    console.error('OCR Processing Error:', error);
    res.status(500).json({ 
      error: 'Failed to process receipt image', 
      details: error.message || error 
    });
  }
};
