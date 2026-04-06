import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { IncomingForm } from 'formidable';
import fs from 'fs';

export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
};

function getAiClient() {
  let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  if (apiKey.startsWith('"') && apiKey.endsWith('"')) apiKey = apiKey.slice(1, -1);
  return new GoogleGenAI({ apiKey });
}

function parseForm(req: any): Promise<{ fields: any; files: any }> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ keepExtensions: true, maxFileSize: 100 * 1024 * 1024 });
    form.parse(req, (err: any, fields: any, files: any) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let filePath: string | null = null;

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new Error('Unauthorized');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { fields, files } = await parseForm(req);
    const file = files.file?.[0] || files.file;
    if (!file) throw new Error('No file uploaded');

    filePath = file.filepath;
    const knowledge_base_id = Array.isArray(fields.knowledge_base_id) ? fields.knowledge_base_id[0] : fields.knowledge_base_id;
    const document_id = Array.isArray(fields.document_id) ? fields.document_id[0] : fields.document_id;

    const ai = getAiClient();
    const uploadResult = await ai.files.upload({
      file: filePath,
      config: {
        mimeType: file.mimetype,
        displayName: file.originalFilename,
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

    res.json({ success: true });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (filePath) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }
}
