# Implementation Plan: Agent Meal Improvements

**Branch**: `002-agent-meal-improvements` | **Date**: 2026-04-08 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/002-agent-meal-improvements/spec.md`

## Summary

Add `update_meal` to the AI agent's tool set (mirroring the existing delete confirm-before-act pattern) and fix timezone-aware date windowing so "today" and "yesterday" resolve to the user's local calendar day rather than UTC midnight. No database migrations required. No UI changes.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode)  
**Primary Dependencies**: Vercel AI SDK (`ai`, `@ai-sdk/react`), Supabase JS v2, Next.js 15 App Router  
**Storage**: PostgreSQL via Supabase — `meal_logs` table, no schema changes  
**Testing**: `npm run build` (tsc + Next.js build) as gate; no automated test suite currently  
**Target Platform**: Vercel (Node.js runtime, server-side route handlers)  
**Project Type**: Web application (Next.js App Router, full-stack)  
**Performance Goals**: No new performance requirements; tools execute within existing AI turn budget  
**Constraints**: `stopWhen: stepCountIs(7)` — update flow must complete within the step budget  
**Scale/Scope**: Single-user sessions; no concurrency concerns within a tool call

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Rule | Status | Notes |
|------|--------|-------|
| Mutations via Server Actions only | ✅ | `updateMealTool` calls Supabase directly inside a server-side tool `execute` — identical pattern to `deleteMealTool`. No client-side mutation. |
| No inline Supabase client | ✅ | All tool `execute` functions use `createClient()` from `src/lib/supabase/server.ts` |
| No hardcoded user identity | ✅ | Every tool independently calls `supabase.auth.getUser()` |
| No schema changes without migration | ✅ | No schema changes needed — `meal_logs` columns are already mutable |
| No Tailwind | ✅ | No UI changes in this feature |
| TypeScript strict / zero build errors | ✅ | Factory function pattern is fully typed |
| AI features use `getAIModel()` abstraction | ✅ | No new model instantiation |
| Bilingual support preserved | ✅ | System prompt rules are language-neutral; agent already responds in user's language |

**Verdict**: No violations. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/002-agent-meal-improvements/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── contracts/
│   └── tool-contracts.md ← Phase 1 output
└── tasks.md             ← Phase 2 output (/speckit.tasks — not created here)
```

### Source Code (files touched by this feature)

```text
src/
├── lib/ai/
│   ├── provider.ts              ← add update_meal rules to system prompt
│   └── tools/
│       └── meal-tools.ts        ← refactor to factory + add updateMealTool
├── app/api/chat/
│   └── route.ts                 ← destructure tzOffset from body, call tool factory
└── components/specific/
    └── AIChatBox.tsx             ← pass tzOffset via useChat body option
```

**Structure Decision**: Single Next.js project. All changes are within the existing AI layer (`src/lib/ai/`) and the chat API route. No new directories needed.

## Complexity Tracking

> No constitution violations — section not applicable.
