---
name: plenish-context
description: Core context and rules for working on the Plenish Next.js application.
---

# Plenish Context

## Goal
Plenish is an application designed to record eaten meals and provide meal recommendations (weekly plan, updateable on demand). It natively supports English and Spanish but is built primarily focusing on a Spanish speaking audience.

## Stack
- **Framework:** Next.js 16.2.1 (App Router, strict TypeScript)
- **Styling:** styled-components 6 (NO Tailwind CSS). Dark-mode first. SSR wrapper via `src/lib/registry.tsx`.
- **Database:** Supabase (PostgreSQL + pgvector for AI similarity search)
- **Auth:** Supabase Google OAuth + SSR middleware cookie refresh
- **AI:** Vercel AI SDK (`ai` package) with `@ai-sdk/google` (Gemini 2.5 Flash default). Switch via `PLENISH_AI_PROVIDER` env var (google | openai).

## Working Features
- Google OAuth → `/login` → `/dashboard` (middleware-protected)
- Meal logging CRUD: `src/actions/meals.ts` (logMeal, getRecentMeals, deleteMeal)
- AI streaming chat: `/api/chat/route.ts` → `streamText` → left column of dashboard
- Dashboard slot composition: `src/app/dashboard/page.tsx` + `DashboardLayout.tsx`

## Mocked — Not Yet Real
- `src/components/specific/CurrentRecommendation.tsx` — hardcoded "Enchiladas Suizas" + `alert()`
- `src/components/specific/NutritionGoals.tsx` — hardcoded progress bars

## Architecture Rules
1. styled-components ONLY. `'use client'` required on every file that uses styled-components.
2. Data mutations → Server Actions in `src/actions/`. Never use `fetch()` from client to `/api/` for mutations.
3. Supabase clients: `src/lib/supabase/client.ts` (browser), `server.ts` (RSC + Server Actions).
4. Always derive user from `supabase.auth.getUser()` — never hardcode `user_id`.
5. New DB tables need RLS policies + migration file in `supabase/migrations/`.

## Dashboard Slot Pattern
The established pattern for adding new async data to the dashboard:
1. Create async Server Component fetcher (e.g. `RecommendationFetcher.tsx`) — no `'use client'`
2. Pass it as a slot prop to `DashboardLayout` (e.g. `recommendationSlot`)
3. Wrap in `<Suspense>` with a skeleton fallback in `page.tsx`

Reference: `src/components/specific/RecentMeals.tsx` + `RecentMealsList.tsx`

## Database Quick Reference
| Table | Key Columns |
|-------|-------------|
| `public.users` | id, email, default_language (default 'es') |
| `public.meal_logs` | id, user_id, log_text, meal_type (breakfast\|lunch\|dinner\|snack), recipe_ids[], eaten_at |
| `public.recipes` | id, user_id (null=global), name, description, language, ingredients[], instructions[], embedding(vector 1536) |
| `public.weekly_plan` | id, user_id, start_date, end_date |
| `public.plan_meals` | id, plan_id, suggested_text, recipe_id, day_of_week (0-6), meal_type, status (planned\|eaten\|skipped\|replaced) |

RLS is enabled on all tables. Users can only read/write their own rows. Global recipes use `user_id IS NULL`.

## AI Architecture
- Provider factory: `src/lib/ai/provider.ts` → `getAIModel()` + `SYSTEM_PROMPT`
- Chat: `/api/chat/route.ts` uses `streamText` + `convertToModelMessages`
- Recommendations (planned): `/api/recommendations/route.ts` will use `generateObject` + Zod schema
- pgvector: extension enabled, `recipes.embedding` column ready — not yet used (needs recipe corpus first)

## Spec-Driven Rules
1. Before proposing large changes, cross-reference `docs/product_spec.md` and `docs/database_schema.md`.
2. Do not introduce Tailwind CSS. Stick exclusively to `styled-components`.
3. Always run `npm run build` before finalizing any change to verify zero type errors.

## Do Not
- Add Tailwind CSS
- Create Supabase client instances inline — use wrappers in `src/lib/supabase/`
- Hardcode `user_id` — always use `supabase.auth.getUser()`
- Call `/api/` routes from client components for mutations — use Server Actions
