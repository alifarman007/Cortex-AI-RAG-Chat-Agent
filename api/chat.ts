import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 60,
};

function getAiClient() {
  let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in Vercel environment variables.');
  if (apiKey.startsWith('"') && apiKey.endsWith('"')) apiKey = apiKey.slice(1, -1);
  if (apiKey.startsWith("'") && apiKey.endsWith("'")) apiKey = apiKey.slice(1, -1);
  return new GoogleGenAI({ apiKey });
}

function getSupabaseClient(token: string) {
  if (!token || token === 'undefined' || token === 'null') {
    throw new Error('Unauthorized: No valid auth token');
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.split(' ')[1];
    const supabase = getSupabaseClient(token);
    const { message, conversation_id, knowledge_base_id, model_id } = req.body;

    const { data: modelData } = await supabase
      .from('models')
      .select('api_model_id')
      .eq('id', model_id || 'flash')
      .single();

    const apiModelId = modelData?.api_model_id || 'gemini-2.0-flash';

    let systemPrompt = 'You are Cortex AI RAG Agent, a helpful assistant. Provide clear, well-formatted markdown responses.';
    if (knowledge_base_id) {
      const { data: kb } = await supabase
        .from('knowledge_bases')
        .select('system_prompt, google_store_id')
        .eq('id', knowledge_base_id)
        .single();
      if (kb?.system_prompt) {
        systemPrompt = `You are Cortex AI RAG Agent. ${kb.system_prompt}`;
      }
    }

    const { data: dbMessages } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true });

    const contents: any[] =
      dbMessages?.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })) || [];

    contents.push({ role: 'user', parts: [{ text: message }] });

    if (knowledge_base_id) {
      const { data: docs } = await supabase
        .from('documents')
        .select('google_file_id, google_document_name, file_type')
        .eq('knowledge_base_id', knowledge_base_id)
        .eq('status', 'ready');

      if (docs && docs.length > 0) {
        const lastMsg = contents[contents.length - 1];
        const fileParts = docs.map((doc: any) => ({
          fileData: {
            fileUri: doc.google_document_name,
            mimeType: doc.file_type || 'application/pdf',
          },
        }));
        lastMsg.parts = [...fileParts, ...lastMsg.parts];
      }
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const ai = getAiClient();

    let responseStream;
    let retries = 3;
    let delay = 1000;

    while (retries >= 0) {
      try {
        responseStream = await ai.models.generateContentStream({
          model: apiModelId,
          contents,
          config: { systemInstruction: systemPrompt },
        });
        break;
      } catch (error: any) {
        const isUnavailable = error.message?.includes('503') || error.message?.includes('UNAVAILABLE');
        if (retries === 0 || !isUnavailable) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        retries--;
      }
    }

    let fullText = '';
    let citations: any[] = [];

    if (responseStream) {
      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullText += chunk.text;
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
        if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
          citations = chunk.candidates[0].groundingMetadata.groundingChunks;
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, fullText, citations })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error('Chat error:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
    }

    let errorMessage = error.message;
    try {
      const parsed = JSON.parse(errorMessage);
      if (parsed.error?.message) {
        try {
          const inner = JSON.parse(parsed.error.message);
          errorMessage = inner.error?.message || parsed.error.message;
        } catch { errorMessage = parsed.error.message; }
      }
    } catch {}

    if (errorMessage.includes('API key not valid') || errorMessage.includes('API_KEY_INVALID')) {
      errorMessage = 'Your API key is invalid. Please check your Vercel environment variables.';
    }

    res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    res.end();
  }
}
