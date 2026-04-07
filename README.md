# Plenish

AI-powered meal tracking and planning app. Log what you eat, get personalized recommendations based on your history. Spanish-first, dark-mode only.

## Stack

- **Next.js 16.2.1** — App Router, TypeScript strict
- **styled-components 6** — no Tailwind
- **Supabase** — Auth (Google OAuth), PostgreSQL, pgvector
- **Vercel AI SDK** — Gemini 2.5 Flash (default), OpenAI optional

## Getting Started

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
# Optional: switch to OpenAI
# PLENISH_AI_PROVIDER=openai
# OPENAI_API_KEY=
```

```bash
npm install
npm run dev
```

## Database

Apply migrations via Supabase CLI:

```bash
supabase db push
```

Or run files in `supabase/migrations/` manually in the Supabase SQL editor.

## Project Structure

```
src/
├── actions/          # Server Actions (data mutations)
├── app/
│   ├── api/          # AI routes (chat, recommendations)
│   └── dashboard/    # Main app shell
├── components/
│   ├── ui/           # Generic primitives (Card, ProgressBar, SkeletonCard)
│   └── specific/     # Domain components (meals, recommendations)
└── lib/
    ├── ai/           # Provider factory + system prompt
    └── supabase/     # Client and server Supabase wrappers
docs/
├── product_spec.md   # Feature spec and user roles
└── database_schema.md
```
