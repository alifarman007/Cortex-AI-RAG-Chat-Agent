import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/api/test-ai', (req, res) => {
  try {
    getAiClient();
    res.json({ success: true });
  } catch (e: any) {
    res.json({ error: e.message });
  }
});

const upload = multer({ dest: 'uploads/' });

// Helper to create an authenticated Supabase client
const getSupabaseClient = (req: express.Request) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  
  if (!token || token === 'undefined' || token === 'null') {
    throw new Error('Unauthorized: No valid auth token provided');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );
};

function getAiClient() {
  // AI Studio injects the Gemini API key into process.env.GEMINI_API_KEY or process.env.API_KEY
  let key = (process.env.GEMINI_API_KEY || process.env.API_KEY || '')?.trim();
  
  if (key && key.startsWith('"') && key.endsWith('"')) {
    key = key.slice(1, -1);
  }
  
  if (!key || key === 'MY_GEMINI_API_KEY' || key === 'YOUR_API_KEY' || key === 'undefined') {
    console.error('[AI Client Error] Invalid or missing API key detected. Key value starts with:', key ? key.substring(0, 3) : 'empty');
    throw new Error('The AI service is currently unavailable due to a server configuration issue. Please try again later.');
  }
  
  return new GoogleGenAI({ apiKey: key });
}

// POST /api/knowledge-base
app.post('/api/knowledge-base', async (req, res) => {
  try {
    const supabase = getSupabaseClient(req);
    const { name, description, system_prompt, model_preference } = req.body;

    // Get user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    // Create Supabase row
    const { data: kb, error: dbError } = await supabase
      .from('knowledge_bases')
      .insert({
        user_id: user.id,
        name,
        description,
        system_prompt: system_prompt || "You are a helpful assistant.",
        google_store_id: uuidv4(), // Mock store ID since corpora doesn't exist
        model_preference: model_preference || 'flash',
      })
      .select()
      .single();

    if (dbError) throw dbError;

    res.json(kb);
  } catch (error: any) {
    console.error('Error creating KB:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/knowledge-base/:id
app.delete('/api/knowledge-base/:id', async (req, res) => {
  try {
    const supabase = getSupabaseClient(req);
    const { id } = req.params;

    // Get KB to find google_store_id
    const { data: kb, error: fetchError } = await supabase
      .from('knowledge_bases')
      .select('google_store_id')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Delete from Google
    // (No corpora to delete, but we could delete files if we tracked them)

    // Delete from Supabase
    const { error: deleteError } = await supabase
      .from('knowledge_bases')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting KB:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const supabase = getSupabaseClient(req);
    const { knowledge_base_id, document_id } = req.body;
    const file = req.file;

    if (!file) throw new Error('No file uploaded');

    // Get KB to find google_store_id
    const { data: kb, error: fetchError } = await supabase
      .from('knowledge_bases')
      .select('google_store_id')
      .eq('id', knowledge_base_id)
      .single();

    if (fetchError) throw fetchError;

    // Upload to Google File API
    const ai = getAiClient();
    const uploadResult = await ai.files.upload({
      file: file.path,
      config: {
        mimeType: file.mimetype,
        displayName: file.originalname,
      }
    });

    // Update Supabase
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        status: 'ready',
        google_file_id: uploadResult.name,
        google_document_name: uploadResult.uri,
      })
      .eq('id', document_id);

    if (updateError) throw updateError;

    // Cleanup local file
    fs.unlinkSync(file.path);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error uploading file:', error);
    
    // Try to update status to failed
    try {
      if (req.body.document_id) {
        const supabase = getSupabaseClient(req);
        await supabase.from('documents').update({
          status: 'failed',
          error_message: error.message
        }).eq('id', req.body.document_id);
      }
    } catch (e) {}

    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/chat
app.post('/api/chat', async (req, res) => {
  try {
    const supabase = getSupabaseClient(req);
    const { message, conversation_id, knowledge_base_id, model_id } = req.body;

    // 1. Resolve model
    const { data: modelData } = await supabase
      .from('models')
      .select('api_model_id')
      .eq('id', model_id)
      .single();
    
    const apiModelId = modelData?.api_model_id || 'gemini-3.1-flash-preview';

    // 2. Get KB
    let systemPrompt = "You are a helpful assistant.";
    let corpusName = null;
    if (knowledge_base_id) {
      const { data: kb } = await supabase
        .from('knowledge_bases')
        .select('system_prompt, google_store_id')
        .eq('id', knowledge_base_id)
        .single();
      if (kb) {
        systemPrompt = kb.system_prompt;
        corpusName = kb.google_store_id;
      }
    }

    // 3. Get history
    const { data: messages } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true });

    const contents: any[] = messages?.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })) || [];

    contents.push({ role: 'user', parts: [{ text: message }] });

    // 4. Call Gemini
    const tools: any[] = [];
    
    // Fetch documents for the KB
    let kbFiles: any[] = [];
    if (knowledge_base_id) {
      const { data: docs } = await supabase
        .from('documents')
        .select('google_file_id, google_document_name, file_type')
        .eq('knowledge_base_id', knowledge_base_id)
        .eq('status', 'ready');
      
      if (docs && docs.length > 0) {
        kbFiles = docs;
      }
    }

    // Prepend documents to the latest user message
    if (kbFiles.length > 0) {
      const lastMessage = contents[contents.length - 1];
      const fileParts = kbFiles.map(doc => ({
        fileData: {
          fileUri: doc.google_document_name,
          mimeType: doc.file_type || 'application/pdf'
        }
      }));
      lastMessage.parts = [...fileParts, ...lastMessage.parts];
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const ai = getAiClient();
    const responseStream = await ai.models.generateContentStream({
      model: apiModelId,
      contents,
      config: {
        systemInstruction: systemPrompt,
        tools: tools.length > 0 ? tools : undefined,
      }
    });

    let fullText = '';
    let citations: any[] = [];

    for await (const chunk of responseStream) {
      if (chunk.text) {
        fullText += chunk.text;
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
      if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        citations = chunk.candidates[0].groundingMetadata.groundingChunks;
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, fullText, citations })}\n\n`);
    res.end();

  } catch (error: any) {
    console.error('Chat error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
