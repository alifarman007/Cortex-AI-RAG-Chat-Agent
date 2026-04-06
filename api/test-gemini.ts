import { GoogleGenAI } from '@google/genai';

export default async function handler(_req: any, res: any) {
  try {
    let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    if (apiKey.startsWith('"') && apiKey.endsWith('"')) apiKey = apiKey.slice(1, -1);
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: 'hello'
    });
    res.json({ success: true, response: response.text });
  } catch (e: any) {
    res.json({ success: false, error: e.message });
  }
}
