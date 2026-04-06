import { GoogleGenAI } from '@google/genai';

export default async function handler(_req: any, res: any) {
  try {
    let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    new GoogleGenAI({ apiKey });
    res.json({ success: true });
  } catch (e: any) {
    res.json({ error: e.message });
  }
}
