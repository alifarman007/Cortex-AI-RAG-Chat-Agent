import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

function getSupabaseClient(token: string) {
  if (!token || token === 'undefined' || token === 'null') throw new Error('Unauthorized');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = req.headers.authorization?.split(' ')[1];
    const supabase = getSupabaseClient(token);
    const { name, description, system_prompt, model_preference } = req.body;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const { data: kb, error: dbError } = await supabase
      .from('knowledge_bases')
      .insert({
        user_id: user.id, name, description,
        system_prompt: system_prompt || 'You are a helpful assistant.',
        google_store_id: uuidv4(),
        model_preference: model_preference || 'flash',
      })
      .select().single();

    if (dbError) throw dbError;
    res.json(kb);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
