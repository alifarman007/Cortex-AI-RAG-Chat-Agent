import { createClient } from '@supabase/supabase-js';

// In AI Studio Build mode, env vars are injected at runtime AND
// also replaced at build time via vite.config.ts define block.
// We check both import.meta.env (Vite) and process.env (define replacement).

const supabaseUrl =
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_URL ||
  (typeof process !== 'undefined' && (process.env as any)?.NEXT_PUBLIC_SUPABASE_URL) ||
  '';

const supabaseAnonKey =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  (typeof process !== 'undefined' && (process.env as any)?.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
  '';

if (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co' || supabaseUrl.includes('YOUR_')) {
  console.warn(
    '[Supabase] Missing URL. Add NEXT_PUBLIC_SUPABASE_URL to your Secrets panel in AI Studio.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);