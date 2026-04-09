# Tasks: Agent Meal Improvements

**Input**: Design documents from `/specs/002-agent-meal-improvements/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/tool-contracts.md ✅

**Organization**: Tasks grouped by user story. US1 and US2 share a foundational refactor (Phase 2) that must complete first.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Setup

**Purpose**: No new packages or directories needed — all work is in existing files.

- [x] T001 Confirm `npm run build` passes clean on current branch before any changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Refactor `meal-tools.ts` from named exports to a factory function. Both US1 and US2 extend this factory, so it must exist first.

**⚠️ CRITICAL**: US1 and US2 cannot begin until this phase is complete.

- [x] T002 Refactor `src/lib/ai/tools/meal-tools.ts` — wrap the four existing tools (`getMealsTool`, `logMealTool`, `saveRecipeTool`, `deleteMealTool`) in a `createMealTools(tzOffsetMinutes: number)` factory function; keep tool logic unchanged; pass `tzOffsetMinutes` as a closed-over variable (unused for now)
- [x] T003 Update `src/app/api/chat/route.ts` to call `createMealTools(0)` and spread the returned tools into the `tools` object, replacing the four individual named imports

**Checkpoint**: `npm run build` must pass after T003 before proceeding.

---

## Phase 3: User Story 1 — Edit a Logged Meal via Chat (Priority: P1) 🎯 MVP

**Goal**: The agent can update a logged meal's description or type after explicit user confirmation.

**Independent Test**: In the chat, say "Cambia el almuerzo de hoy — en realidad fue pollo con arroz". The agent must call `get_meals`, show the current entry, ask for confirmation, then update the record. Verify in the dashboard that the meal shows the new text.

- [x] T004 [P] [US1] Add `updateMealTool` to the `createMealTools` factory in `src/lib/ai/tools/meal-tools.ts` — input schema: `{ meal_id: z.string().uuid(), log_text: z.string().min(1).max(500).optional(), meal_type: z.enum([...]).optional() }` with a `.refine()` requiring at least one field; `execute` calls `supabase.from('meal_logs').update({...}).match({ id: meal_id, user_id: user.id })` then `revalidatePath('/dashboard')`
- [x] T005 [P] [US1] Add update_meal confirmation rules to the system prompt in `src/lib/ai/provider.ts` — mirror the Deletion Rules block: call `get_meals` first, show current entry + proposed change, require explicit confirmation, never call `update_meal` without confirmed approval
- [x] T006 [US1] Register `update_meal: updateMealTool` in the tools object in `src/app/api/chat/route.ts` (depends on T004)

**Checkpoint**: US1 fully functional. Test the chat edit flow end-to-end before moving to US2.

---

## Phase 4: User Story 2 — "Today" Respects User's Local Date (Priority: P2)

**Goal**: `get_meals(period="today")` returns meals in the user's local calendar day, not UTC midnight.

**Independent Test**: Log a meal, then ask "¿Qué comí hoy?". The meal must appear regardless of the user's UTC offset. If testing manually, temporarily set `tzOffset` to `300` (UTC-5) in `AIChatBox.tsx` to verify the window shifts correctly.

- [x] T007 [P] [US2] Apply timezone-aware date windowing in `getMealsTool` inside `src/lib/ai/tools/meal-tools.ts` — replace `setUTCHours(0,0,0,0)` with offset-adjusted window: `localDayStartUTC = Date.UTC(y, m, d, 0, 0, 0) - tzOffsetMinutes * 60_000`; apply same logic to "yesterday" and "week" ranges; use `tzOffsetMinutes` from the factory closure
- [x] T008 [P] [US2] Destructure `tzOffset` from the request body in `src/app/api/chat/route.ts` and pass it to `createMealTools(tzOffset ?? 0)`; guard against `NaN`: `const tz = Number.isFinite(tzOffset) ? tzOffset : 0`
- [x] T009 [P] [US2] Pass timezone offset via `useChat` body option in `src/components/specific/AIChatBox.tsx` — change `useChat()` to `useChat({ body: { tzOffset: new Date().getTimezoneOffset() } })`

**Checkpoint**: US1 and US2 both work independently. Test both chat flows before Polish.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T010 Run `npm run build` and confirm zero TypeScript errors and zero Next.js build warnings
- [x] T011 [P] Update `docs/database_schema.md` if any behavioural notes about `eaten_at` timezone handling are worth documenting for future contributors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** (Setup): No dependencies — start immediately
- **Phase 2** (Foundational): Depends on Phase 1 — **BLOCKS both US1 and US2**
- **Phase 3** (US1): Depends on Phase 2 completion
- **Phase 4** (US2): Depends on Phase 2 completion — can run in parallel with Phase 3 if desired
- **Phase 5** (Polish): Depends on Phases 3 and 4

### Within Phase 3 (US1)

- T004 and T005 are independent (different files) — run in parallel
- T006 depends on T004 (registers the tool produced by T004)

### Within Phase 4 (US2)

- T007, T008, T009 are all independent (different files) — run in parallel

---

## Parallel Execution Examples

### Phase 3 (US1) — parallel start

```
Parallel:
  Task T004: Add updateMealTool to meal-tools.ts
  Task T005: Add update rules to system prompt in provider.ts

Then sequential:
  Task T006: Register update_meal in route.ts  (after T004)
```

### Phase 4 (US2) — fully parallel

```
Parallel:
  Task T007: Timezone window logic in meal-tools.ts
  Task T008: Destructure tzOffset in route.ts
  Task T009: Pass tzOffset via useChat body in AIChatBox.tsx
```

---

## Implementation Strategy

### MVP First (US1 Only — 3 tasks after foundational)

1. Complete T001 (baseline check)
2. Complete T002–T003 (factory refactor)
3. Complete T004–T006 (update_meal tool)
4. **STOP and VALIDATE**: Test the edit flow in chat
5. Merge or continue to US2

### Full Delivery

1. T001 → T002, T003 → T004, T005 → T006 → T007, T008, T009 → T010, T011

---

## Notes

- No new npm packages required
- No database migrations required
- `eaten_at` remains stored as UTC — the timezone fix is query-side only
- The `tzOffsetMinutes` factory parameter is `0` after Phase 2 and only becomes meaningful after T008
- Commit after each phase checkpoint to keep the branch clean
