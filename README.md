# Cortex AI — RAG Agent

A multi-tenant, document-aware chat application. Upload your PDFs, DOCX, TXT, CSV, or JSON files into a *knowledge base* and ask questions against them. Powered by Google Gemini, Supabase, and deployed on Vercel.

Live: **https://cortex-ai-rag-agent.vercel.app**

---

## Features

### Authentication
- Email + password sign-up / sign-in
- Google OAuth (Supabase-managed)
- Session-aware routing — protected pages redirect to `/login` when signed-out

### Knowledge Bases
- Create unlimited knowledge bases per user
- Each KB has its own name, description, and system prompt
- Drag-and-drop document upload (PDF, DOCX, TXT, CSV, JSON, XLSX, HTML, MD — up to 100 MB)
- Real-time upload status (uploading → ready → failed) with error messages
- Inline editable name, description, and system prompt — autosaves on blur
- Delete documents with optimistic UI

### Chat
- Streamed responses via Server-Sent Events
- Markdown rendering (`react-markdown` + `remark-gfm`) with code blocks, tables, lists
- Attach any knowledge base to any conversation via the top-bar selector
- New conversations auto-attach your most recent KB
- Per-conversation title auto-generated from your first message
- Sidebar lists conversations + KBs with realtime sync; conversations are deletable
- Welcome screen prompts and "ready when you are" copy depending on state

### Model Selection
- Two-tier setup: default *Flash* model + optional *Extra Mode* (Pro)
- Toggle Extra Mode in Settings — persisted in `localStorage`
- Default fallback: `gemini-3-flash-preview` / `gemini-3-pro-preview`
- Model definitions live in the Supabase `models` table so they can be changed without redeploying

### Appearance
- Dark / Light / System theme (persisted in `localStorage`)
- Custom tokenized Tailwind palette using CSS variables
- DM Sans + Instrument Serif + JetBrains Mono fonts
- Glass-panel login, motion-powered transitions via `motion/react`

### Production hardening
- Gemini Files API expiry detection — when a file's 48-hour TTL passes, the chat handler auto-marks the row as `failed` so future chats stop attaching it
- Per-conversation realtime channels (no name collisions between KBs)
- `REPLICA IDENTITY FULL` on `documents` so realtime DELETE events propagate
- Optimistic delete with rollback-on-error
- RLS policies on every table — users only see their own data

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | React 19 + TypeScript + Vite + TailwindCSS v4 |
| Router | React Router 7 |
| Animations | `motion/react` |
| Markdown | `react-markdown` + `remark-gfm` |
| AI | `@google/genai` (Gemini 3 family) |
| Backend | Vercel Serverless Functions (`/api/*`) |
| Database + Auth | Supabase (Postgres 17, Auth, Realtime, RLS) |
| File parsing | `formidable` (multipart in serverless) |
| Local dev server | Express via `tsx` (`server.ts`) |
| Hosting | Vercel |

---

## Project structure

```
.
├── api/                       # Vercel serverless functions (production)
│   ├── chat.ts                # Streamed chat with KB documents attached
│   ├── upload.ts              # File upload → Gemini Files API
│   ├── knowledge-base.ts      # KB creation
│   ├── knowledge-base/[id].ts # KB delete
│   ├── test-ai.ts             # API-key sanity check
│   └── test-gemini.ts         # Model sanity check
├── src/
│   ├── App.tsx                # Routes + ProtectedRoute wrapper
│   ├── main.tsx               # React root
│   ├── index.css              # Tailwind v4 theme tokens
│   ├── lib/
│   │   ├── AuthContext.tsx    # Supabase session state
│   │   └── supabase.ts        # Supabase client
│   ├── components/
│   │   └── Sidebar.tsx        # Conversations + KBs nav
│   └── pages/
│       ├── Login.tsx          # Email + Google OAuth
│       ├── Chat.tsx           # Conversation thread
│       ├── KnowledgeBases.tsx # KB grid
│       ├── KnowledgeBaseDetail.tsx # KB editor + docs
│       └── Settings.tsx       # Theme + Extra Mode toggle
├── public/                    # Static SEO assets
│   ├── favicon.svg
│   └── og-image.svg
├── server.ts                  # Local-dev Express server (mirrors /api/*)
├── vercel.json                # SPA rewrites + lambda config
├── vite.config.ts             # Vite + Tailwind plugin
└── .env.example               # Required environment variables
```

---

## Database schema

Five public tables, all RLS-protected by `auth.uid() = user_id`:

- **`knowledge_bases`** — id (uuid), user_id, name, description, system_prompt, google_store_id, model_preference
- **`documents`** — id (uuid), knowledge_base_id, user_id, file_name, file_size, file_type, status (`uploading`|`indexing`|`ready`|`failed`), google_file_id, google_document_name, error_message
- **`conversations`** — id (uuid), user_id, knowledge_base_id (nullable), title, pinned
- **`messages`** — id (uuid), conversation_id, role (`user`|`assistant`), content, citations (jsonb), model_used, tokens_used
- **`models`** — id (text), display_name, api_model_id, description, sort_order, is_default, is_enabled

The `models` table is publicly readable; everything else is per-user.

---

## Local development

### Prerequisites
- Node.js 20+
- A Supabase project (free tier is fine)
- A Gemini API key

### Setup

```bash
git clone https://github.com/alifarman007/Cortex-AI-RAG-Chat-Agent.git
cd Cortex-AI-RAG-Chat-Agent
npm install
cp .env.example .env
# Fill in .env (see Environment variables below)
npm run dev
```

App is available at `http://localhost:3000`.

### Environment variables

Set these in your `.env` (local) **and** in Vercel → Project → Settings → Environment Variables (production):

| Variable | Source | Used in |
|---|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey | Server-side AI calls |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | Client + server |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | (reserved, not currently used in code) |

> ⚠️ The `NEXT_PUBLIC_*` prefix is exposed to the browser; only put genuinely public values there. Service-role keys must stay server-side only.

### Supabase setup

1. In **Authentication → URL Configuration**, set:
   - **Site URL**: your production URL (e.g. `https://cortex-ai-rag-agent.vercel.app`)
   - **Redirect URLs**: include `http://localhost:3000/**` and your production URL
2. In **Authentication → Providers → Google**, enable Google and paste the credentials from your Google Cloud OAuth client. The OAuth client's authorized redirect URI must be `https://<your-supabase-ref>.supabase.co/auth/v1/callback`.
3. Run the schema in your project (the five tables above with RLS policies). Make sure `REPLICA IDENTITY FULL` is set on `public.documents` so realtime DELETE events propagate.
4. Seed at least the `flash` and `pro` rows in the `models` table:

```sql
INSERT INTO public.models (id, display_name, api_model_id, sort_order, is_default, is_enabled) VALUES
  ('flash', 'Flash', 'gemini-3-flash-preview', 1, true,  true),
  ('pro',   'Pro',   'gemini-3-pro-preview',   2, false, true);
```

---

## Deployment (Vercel)

1. Connect the repo to Vercel — Vercel auto-detects Vite.
2. Add the environment variables listed above under **Production**.
3. `vercel.json` (committed) handles SPA rewrites + serverless function routing — nothing else to configure.
4. Push to `main` → Vercel builds + deploys automatically.

### Production caveats
- **Gemini Files API expires uploaded files after 48 hours.** Documents uploaded earlier than that will start returning `permission to access File X or it may not exist`. The chat handler now catches this and marks the affected document as `failed` so subsequent requests skip it — but users need to re-upload to keep using that file.
- Serverless functions run with `maxDuration: 60s`. Chat streams that take longer will get cut off.
- Multipart uploads are parsed with `formidable` (Vercel doesn't let Express's `multer` work natively).

---

## Known limitations / roadmap
- 48-hour Gemini Files API TTL — a true persistent RAG layer (chunk → embed → store in pgvector → retrieve at chat-time) would solve this.
- No streaming citation links yet — citations are captured but rendered as plain text chips.
- No document re-indexing UI — a stale doc must be deleted and re-uploaded.
- No team/workspace sharing of knowledge bases — every KB is single-user.

---

## License

MIT
