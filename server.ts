import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

// =============================================
// FORCE ENV SYNC (AI Studio Workaround)
// =============================================
try {
  const devEnvPath = '/app/.dev.env.json';
  if (fs.existsSync(devEnvPath)) {
    const devEnv = JSON.parse(fs.readFileSync(devEnvPath, 'utf8'));
    for (const key in devEnv) {
      process.env[key] = devEnv[key];
    }
    console.log('[Startup] Synced environment variables from /app/.dev.env.json');
  }
} catch (e: any) {
  console.log('[Startup] Could not sync dev env:', e.message);
}

const app = express();
const PORT = 3000;

app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// =============================================
// DEBUG ENDPOINT - visit /api/debug-env
// DELETE BEFORE PRODUCTION
// =============================================
app.get('/api/debug-env', (_req, res) => {
  res.json(process.env);
});

// =============================================
// AI CLIENT
// =============================================
function getAiClient(): GoogleGenAI {
  let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error('API key is missing. Please go to the Secrets panel (key icon) and ensure GEMINI_API_KEY is set to "AI Studio Free Tier" or a valid API key, then click Apply Changes.');
  }
  
  // Strip wrapping quotes if present
  if (apiKey.startsWith('"') && apiKey.endsWith('"')) apiKey = apiKey.slice(1, -1);
  if (apiKey.startsWith("'") && apiKey.endsWith("'")) apiKey = apiKey.slice(1, -1);
  
  if (apiKey === 'AI Studio Free Tier') {
    throw new Error('You have literally typed "AI Studio Free Tier" into the secrets panel. Please click the dropdown and select the Free Tier option instead of typing it, then click Apply Changes.');
  }

  if (apiKey === 'MY_GEMINI_API_KEY' || apiKey === 'YOUR_API_KEY') {
    throw new Error(`The server is still receiving the placeholder text "${apiKey}" instead of your selected Free Tier key. This means the Secrets panel is stuck and failing to sync with the server. Please try this workaround: 1. Open the Secrets panel and click the TRASH CAN icon next to GEMINI_API_KEY to delete it completely. 2. Click "Apply changes". 3. Open the Secrets panel again, click "Add secret", name it GEMINI_API_KEY, and select "AI Studio Free Tier". 4. Click "Apply changes" one last time. If that still fails, please paste a real Google AI Studio API key (starting with AIza...) instead of using the dropdown.`);
  }

  return new GoogleGenAI({ apiKey });
}

// =============================================
// SUPABASE CLIENT (per-request, with user auth)
// =============================================
function getSupabaseClient(req: express.Request) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token || token === 'undefined' || token === 'null') {
    throw new Error('Unauthorized: No valid auth token');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// =============================================
// ROUTES
// =============================================

app.get('/api/test-gemini', async (_req, res) => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: 'hello'
    });
    res.json({ success: true, response: response.text });
  } catch (e: any) {
    res.json({ success: false, error: e.message });
  }
});

app.get('/api/test-ai', (_req, res) => {
  try {
    getAiClient();
    res.json({ success: true });
  } catch (e: any) {
    res.json({ error: e.message });
  }
});

// POST /api/knowledge-base
app.post('/api/knowledge-base', async (req, res) => {
  try {
    const supabase = getSupabaseClient(req);
    const { name, description, system_prompt, model_preference } = req.body;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const { data: kb, error: dbError } = await supabase
      .from('knowledge_bases')
      .insert({
        user_id: user.id,
        name,
        description,
        system_prompt: system_prompt || 'You are a helpful assistant.',
        google_store_id: uuidv4(),
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

    const ai = getAiClient();
    const uploadResult = await ai.files.upload({
      file: file.path,
      config: {
        mimeType: file.mimetype,
        displayName: file.originalname,
      },
    });

    const { error: updateError } = await supabase
      .from('documents')
      .update({
        status: 'ready',
        google_file_id: uploadResult.name,
        google_document_name: uploadResult.uri,
      })
      .eq('id', document_id);

    if (updateError) throw updateError;

    fs.unlinkSync(file.path);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error uploading file:', error);

    try {
      if (req.body.document_id) {
        const supabase = getSupabaseClient(req);
        await supabase
          .from('documents')
          .update({ status: 'failed', error_message: error.message })
          .eq('id', req.body.document_id);
      }
    } catch (_) {}

    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
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
      .eq('id', model_id || 'flash')
      .single();

    const apiModelId = modelData?.api_model_id || 'gemini-3-flash-preview';

    // 2. Get KB config
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

    // 3. Get conversation history
    const { data: dbMessages } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true });

    const contents: any[] =
      dbMessages?.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })) || [];

    contents.push({ role: 'user', parts: [{ text: message }] });

    // 4. Attach uploaded documents as file references
    if (knowledge_base_id) {
      const { data: docs } = await supabase
        .from('documents')
        .select('google_file_id, google_document_name, file_type')
        .eq('knowledge_base_id', knowledge_base_id)
        .eq('status', 'ready');

      if (docs && docs.length > 0) {
        const lastMsg = contents[contents.length - 1];
        const fileParts = docs.map((doc) => ({
          fileData: {
            fileUri: doc.google_document_name,
            mimeType: doc.file_type || 'application/pdf',
          },
        }));
        lastMsg.parts = [...fileParts, ...lastMsg.parts];
      }
    }

    // 5. Stream response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const ai = getAiClient();

    console.log(`[Chat] Using model: ${apiModelId}`);

    let responseStream;
    let retries = 3;
    let delay = 1000;

    while (retries >= 0) {
      try {
        responseStream = await ai.models.generateContentStream({
          model: apiModelId,
          contents,
          config: {
            systemInstruction: systemPrompt,
          },
        });
        break; // Success
      } catch (error: any) {
        const isUnavailable = error.message?.includes('503') || error.message?.includes('UNAVAILABLE');
        if (retries === 0 || !isUnavailable) {
          throw error;
        }
        console.log(`[Chat] Model unavailable, retrying in ${delay}ms... (${retries} retries left)`);
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
      // Sometimes the error message is a JSON string containing the real error
      const parsed = JSON.parse(errorMessage);
      if (parsed.error && parsed.error.message) {
        // Try to parse the inner message if it's also JSON
        try {
          const innerParsed = JSON.parse(parsed.error.message);
          if (innerParsed.error && innerParsed.error.message) {
            errorMessage = innerParsed.error.message;
          } else {
            errorMessage = parsed.error.message;
          }
        } catch (e) {
          errorMessage = parsed.error.message;
        }
      }
    } catch (e) {
      // Not JSON, keep original message
    }
    
    // Add a helpful hint for API key errors
    if (errorMessage.includes('API key not valid') || errorMessage.includes('API_KEY_INVALID')) {
      errorMessage = 'Your API key is invalid. Please go to the Secrets panel (the key icon on the left), ensure your GEMINI_API_KEY is correct, and click Apply Changes.';
    }

    res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    res.end();
  }
});

// =============================================
// START SERVER
// =============================================
async function startServer() {
  // Log env state at startup
  console.log('[Startup] GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.substring(0, 10)}... (${process.env.GEMINI_API_KEY.length} chars)` : 'NOT SET');
  console.log('[Startup] API_KEY:', process.env.API_KEY ? `${process.env.API_KEY.substring(0, 10)}...` : 'NOT SET');
  console.log('[Startup] SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'NOT SET');

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Startup] Server running on http://localhost:${PORT}`);
  });
}

startServer();