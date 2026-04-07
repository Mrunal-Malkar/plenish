# Implementation Plan: Conversational Meal Management & Context-Aware Recommendations

**Branch**: `001-agent-meal-crud` | **Date**: 2026-04-07 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/001-agent-meal-crud/spec.md`

## Summary

Extend the existing AI chat agent from a plain conversational responder into a tool-equipped agent that can log meals, query meal history, and delete meal entries directly from the conversation. Recommendations become context-aware by injecting the user's real meal history into every response. No new database tables are required for v1 — the existing `meal_logs` schema covers all CRUD operations.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode)  
**Primary Dependencies**: Next.js 16.2.1 (App Router), Vercel AI SDK `ai@6.0.141`, `@ai-sdk/google@3.0.53`, Zod 4.3.6, styled-components 6  
**Storage**: Supabase PostgreSQL — `meal_logs` table (existing). No schema changes required for v1.  
**Testing**: `npm run build` type-check gate (no automated test suite configured yet)  
**Target Platform**: Web (Node.js server, Next.js API Route Handler)  
**Performance Goals**: Tool execution round-trip transparent to user — assistant response begins streaming while tool executes  
**Constraints**: All DB operations must be user-scoped via `supabase.auth.getUser()`; RLS enforced at DB layer  
**Scale/Scope**: Single authenticated user per session; tool calls limited to one at a time per turn

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. User-First Nutrition Intelligence | ✅ PASS | Serves all three outcomes: logging, history visibility, recommendations |
| II. AI as Advisor, Not Oracle | ✅ PASS | Tools surface data; agent explains; user always confirms deletions |
| III. Spec-Driven Development | ✅ PASS | Spec exists; no schema changes → no migration needed for v1 |
| IV. Typed, Server-Authoritative Data Layer | ✅ PASS | Tool `execute` functions run server-side inside the Route Handler — not client-initiated mutations. Supabase server client used throughout. |
| V. Consistency Over Cleverness | ✅ PASS | Uses existing `getAIModel()`, existing Supabase client wrappers, no new patterns introduced |
| Bilingual | ✅ PASS | System prompt already handles language mirroring; tool descriptions are internal |
| No mocked data in production paths | ✅ PASS | Replaces no mocks directly, but enables real recommendations |

**CONFLICT RESOLVED**: `spec.md` referenced "Diet Guidelines" as a stored entity — no such table exists in `database_schema.md`. Resolution: system prompt serves as v1 diet guideline proxy. No `nutrition_goals` table needed for this feature. Spec assumption updated in `research.md`.

## Project Structure

### Documentation (this feature)

```text
specs/001-agent-meal-crud/
├── plan.md              ← this file
├── research.md          ← Phase 0: decisions + conflict resolutions
├── data-model.md        ← Phase 1: entity shapes + validation rules
├── contracts/
│   └── agent-tools.md   ← Phase 1: tool interface contracts
└── tasks.md             ← Phase 2 (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── actions/
│   └── meals.ts                    # EXISTING — logMeal, getRecentMeals, deleteMeal
├── lib/
│   ├── ai/
│   │   ├── provider.ts             # MODIFY — update SYSTEM_PROMPT with Menú Planner nutrition principles
│   │   └── tools/
│   │       └── meal-tools.ts       # NEW — tool definitions (log_meal, get_meals, delete_meal, save_recipe)
│   └── supabase/
│       ├── client.ts               # EXISTING — browser client
│       └── server.ts               # EXISTING — server client (used by tools)
└── app/
    └── api/
        └── chat/
            └── route.ts            # MODIFY — add tools + maxSteps: 7 to streamText call
```

## Complexity Tracking

No constitution violations. No complexity justification required.
