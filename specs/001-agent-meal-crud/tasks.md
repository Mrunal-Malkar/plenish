# Tasks: Conversational Meal Management & Context-Aware Recommendations

**Input**: Design documents from `/specs/001-agent-meal-crud/`
**Branch**: `001-agent-meal-crud`

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. No tests requested — implementation tasks only.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on each other)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths included in all task descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the new module and update the system prompt. Both tasks are independent of each other.

- [x] T0 [P] Create `src/lib/ai/tools/meal-tools.ts` — new file with TypeScript module scaffold: import `createClient` from `@/lib/supabase/server`, import `z` from `zod`, import `revalidatePath` from `next/cache`, and export four named tool constants as stubs: `logMealTool`, `getMealsTool`, `deleteMealTool`, `saveRecipeTool` (each as an empty object `{}` for now — will be filled per story phase)
- [x] T0 [P] Update `SYSTEM_PROMPT` in `src/lib/ai/provider.ts` — replace current one-paragraph prompt with a structured version that includes: (1) role and tone (same as now), (2) **Nutrition Guidelines** section encoding Menú Planner principles: three food groups (Vitaminas=vegetables/fruit, Proteínas=meat/fish/eggs/legumes, Hidratos=pasta/potato/rice preferably whole grain), weekly protein rotation (white meat → legumes → blue fish → white fish → red meat), breakfast rule (dairy + fruit + whole grain cereal), snack rule (dairy + fruit or small sandwich), sweets occasional only, (3) **Tool Usage** section telling the agent: "use your tools to read and write meal data — never make up what the user has eaten"

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement `get_meals` and wire it into the chat route. This tool is required by US2, US3, and US4. No user story can be independently tested until this phase is done.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T0 Implement `getMealsTool` in `src/lib/ai/tools/meal-tools.ts` — replace the stub with a full Vercel AI SDK tool object: `description` explains it fetches the user's meal history for a given period; `parameters` is a Zod schema with `period: z.enum(["today", "yesterday", "week"]).optional().default("today")`; `execute` function: (1) `const supabase = await createClient()`, (2) `getUser()` auth check — return `{ meals: [], count: 0, error: "Unauthorized" }` on failure, (3) compute date range from `period`: today=start of current day UTC, yesterday=previous day, week=last 7 days, (4) query `meal_logs` table with `.gte("eaten_at", rangeStart).lte("eaten_at", rangeEnd).eq("user_id", user.id).order("eaten_at", { ascending: false })`, (5) return `{ meals: data, count: data.length }`
- [x] T0 Wire `getMealsTool` into `src/app/api/chat/route.ts` — import `getMealsTool` from `@/lib/ai/tools/meal-tools`; add `tools: { get_meals: getMealsTool }` and `maxSteps: 7` to the `streamText` call; keep all other params unchanged; run `npm run build` and confirm zero TypeScript errors

**Checkpoint**: Foundation ready. Ask the agent "¿qué comí hoy?" — it should call `get_meals`, get an empty result, and respond naturally that no meals have been logged yet.

---

## Phase 3: User Story 1 — Log a Meal Through Conversation (Priority: P1) 🎯 MVP

**Goal**: User tells the agent what they ate → agent saves it to `meal_logs` and opportunistically infers + saves the recipe to `public.recipes`.

**Independent Test**: Type "comí reina pepiada para el almuerzo" in chat → verify a new row appears in `meal_logs` with `meal_type='lunch'` AND a new row appears in `public.recipes` with `ingredients` containing at least arepa, chicken, and avocado.

- [x] T0 [US1] Implement `logMealTool` in `src/lib/ai/tools/meal-tools.ts` — replace stub with: `description` says it records a meal the user just described; `parameters` Zod schema: `log_text: z.string().min(1).max(500)`, `meal_type: z.enum(["breakfast","lunch","dinner","snack"])`, `eaten_at: z.string().optional()`; `execute` function: (1) auth check via `getUser()`, (2) INSERT into `meal_logs` with `{ user_id: user.id, log_text, meal_type, eaten_at: eaten_at ?? new Date().toISOString() }`, (3) call `revalidatePath("/dashboard")`, (4) return `{ success: true, meal_id: data.id, log_text, meal_type }` on success or `{ success: false, error: message }` on failure
- [x] T0 [US1] Implement `saveRecipeTool` in `src/lib/ai/tools/meal-tools.ts` — replace stub with: `description` explains the tool infers and persists a recipe the agent learned from a meal description — to be called only when ≥ 2 ingredients can be reasonably inferred; `parameters` Zod schema: `name: z.string().min(1).max(200)`, `description: z.string()`, `ingredients: z.array(z.string()).min(2)`, `instructions: z.array(z.string()).default([])`, `language: z.enum(["es","en"]).default("es")`; `execute` function: (1) auth check, (2) INSERT into `recipes` with `{ user_id: user.id, name, description, ingredients, instructions, language }`, (3) do NOT call `revalidatePath` (recipes not shown on dashboard v1), (4) return `{ success: true, recipe_id: data.id, name, ingredient_count: ingredients.length }` on success or `{ success: false, error: message }` silently (meal log already succeeded)
- [x] T0 [US1] Register `logMealTool` and `saveRecipeTool` in `src/app/api/chat/route.ts` — add both to the `tools` object: `{ get_meals: getMealsTool, log_meal: logMealTool, save_recipe: saveRecipeTool }`; `maxSteps: 7` already set in T004
- [x] T0 [US1] Run `npm run build` — fix any TypeScript errors in `meal-tools.ts` or `route.ts` before proceeding to manual verification

**Checkpoint**: User Story 1 complete. Send "acabo de comer avena con plátano para el desayuno" → confirm meal row + recipe row created. Check `RecentMeals` dashboard panel refreshes automatically.

---

## Phase 4: User Story 2 — Context-Aware Food Recommendations (Priority: P2)

**Goal**: When user asks for a meal suggestion, agent fetches their history via `get_meals` and responds with a recommendation grounded in what they've already eaten today and the Menú Planner principles.

**Independent Test**: Log a high-protein breakfast via chat, then ask "¿qué me recomiendas para el almuerzo?" — agent response must explicitly reference the logged breakfast AND suggest something that complements it nutritionally (e.g., adds vegetables or carbs if the breakfast was protein-heavy).

- [x] T0 [US2] Refine `getMealsTool` description in `src/lib/ai/tools/meal-tools.ts` — update the `description` string to explicitly state: "Call this tool before making any food recommendation. Use the returned meal history to understand what the user has already eaten today and ensure suggestions complement their day nutritionally according to the three food groups (vitamins, proteins, carbohydrates)." This description is what guides the model's tool-calling decision.
- [x] T0 [US2] Add recommendation behaviour guidance to `SYSTEM_PROMPT` in `src/lib/ai/provider.ts` — append a **Recommendation Rules** section: "When asked for a meal suggestion: (1) ALWAYS call get_meals(period='today') first, (2) analyze which food groups are already covered, (3) recommend a meal that fills missing groups, (4) briefly explain why — e.g., 'Ya tienes proteína en el desayuno, te sugiero algo con verdura e hidratos para la comida', (5) if no meals logged, recommend based on the three-group principle and mention they haven't logged anything yet."
- [x] T0 [US2] Run `npm run build` and verify zero errors

**Checkpoint**: User Story 2 complete. The agent proactively fetches history and gives reasoned, specific recommendations. No new tools needed — all behaviour comes from improved descriptions and system prompt.

---

## Phase 5: User Story 3 — Review Meal History Through Conversation (Priority: P3)

**Goal**: User can ask "¿qué comí hoy?" or "¿qué comí esta semana?" and receive an accurate, formatted summary of their logged meals — pulled from the database, not hallucinated.

**Independent Test**: Log two meals via chat (breakfast and lunch), then ask "¿qué he comido hoy?" — agent must list both meals accurately with their types and times.

- [x] T0 [US3] Add history-query guidance to `SYSTEM_PROMPT` in `src/lib/ai/provider.ts` — append a **History Queries** section: "When asked what the user has eaten: (1) ALWAYS call get_meals with the appropriate period (today/yesterday/week), (2) format the results as a readable list with meal type and time, (3) if the list is empty, say so clearly and offer to help log a meal, (4) NEVER describe meals the user didn't log."
- [x] T0 [US3] Run `npm run build` and verify zero errors

**Checkpoint**: User Story 3 complete. Ask "¿qué comí ayer?" with no meals logged for yesterday → agent responds clearly that no meals were recorded. Ask with meals logged → agent lists them accurately.

---

## Phase 6: User Story 4 — Delete a Meal Through Conversation (Priority: P4)

**Goal**: User can ask the agent to remove a logged meal. Agent identifies the target, asks for confirmation, then deletes only the confirmed entry.

**Independent Test**: Log a meal, then say "elimina el último registro" → agent describes the meal it found and asks to confirm → user confirms → meal is removed from `meal_logs` and disappears from the dashboard.

- [x] T0 [US4] Implement `deleteMealTool` in `src/lib/ai/tools/meal-tools.ts` — replace stub with: `description` says "Delete a specific meal log entry by ID. IMPORTANT: only call this tool AFTER presenting the meal to the user and receiving explicit confirmation. Never guess the meal_id — always retrieve it via get_meals first."; `parameters` Zod schema: `meal_id: z.string().uuid()`; `execute` function: (1) auth check via `getUser()`, (2) DELETE from `meal_logs` where `id = meal_id AND user_id = user.id` (double-filter: code + RLS), (3) call `revalidatePath("/dashboard")`, (4) return `{ success: true }` or `{ success: false, error: message }`
- [x] T0 [US4] Register `deleteMealTool` in `src/app/api/chat/route.ts` — add `delete_meal: deleteMealTool` to the tools object; tools object is now: `{ get_meals: getMealsTool, log_meal: logMealTool, save_recipe: saveRecipeTool, delete_meal: deleteMealTool }`
- [x] T0 [US4] Add deletion confirmation guidance to `SYSTEM_PROMPT` in `src/lib/ai/provider.ts` — append a **Deletion Rules** section: "When user asks to delete a meal: (1) call get_meals to find candidates, (2) show the user exactly which entry you intend to delete (log_text + time), (3) ask for explicit confirmation before calling delete_meal, (4) if user says no, cancel and confirm cancellation, (5) NEVER call delete_meal without confirmed user approval."
- [x] T0 [US4] Run `npm run build` and fix any TypeScript errors

**Checkpoint**: User Story 4 complete. All four user stories are now functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Bilingual audit, type safety, and documentation alignment.

- [x] T0 [P] Audit all tool `description` strings in `src/lib/ai/tools/meal-tools.ts` — ensure they are written in English (tool descriptions are internal to the model) but reference bilingual behaviour where needed (e.g., "responds in the same language the user writes in")
- [x] T0 [P] Update `docs/database_schema.md` — add a note under `public.recipes` section: "User-owned recipes (user_id IS NOT NULL) are created automatically by the AI agent when it infers a recipe from a meal description. Global recipes (user_id IS NULL) are system-provided and not yet populated."
- [x] T0 Final `npm run build` — zero TypeScript errors required before closing this feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001 and T002 can start immediately in parallel
- **Foundational (Phase 2)**: Depends on T001 (file must exist before implementing tools) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 (needs `getMealsTool` registered so route compiles)
- **US2 (Phase 4)**: Depends on Phase 2 (`get_meals` must exist). Independent of US1.
- **US3 (Phase 5)**: Depends on Phase 2. Independent of US1, US2.
- **US4 (Phase 6)**: Depends on Phase 2. Independent of US1, US2, US3.
- **Polish (Phase 7)**: Depends on all desired stories being complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — no story dependencies
- **US2 (P2)**: After Phase 2 — no story dependencies (shares `get_meals` from foundational)
- **US3 (P3)**: After Phase 2 — no story dependencies
- **US4 (P4)**: After Phase 2 — no story dependencies

### Within Each User Story

- Tool implementation before route registration
- Route registration before `npm run build`
- Build must pass before marking checkpoint complete

### Parallel Opportunities

- T001 and T002 are fully parallel (different files)
- T005 and T006 are fully parallel (both implement stubs in the same file — implement sequentially if solo)
- US2, US3, and US4 phases are independent once Phase 2 completes
- T018 and T019 are fully parallel (different files)

---

## Parallel Example: Phase 1

```
Parallel launch (different files, no dependencies):
  Task T001: Create src/lib/ai/tools/meal-tools.ts scaffold
  Task T002: Update SYSTEM_PROMPT in src/lib/ai/provider.ts
```

## Parallel Example: US1

```
After T004 (route compiles with get_meals):
  Task T005: Implement logMealTool   ← same file, do sequentially
  Task T006: Implement saveRecipeTool ← same file, do sequentially
Then:
  Task T007: Register both in route.ts
  Task T008: npm run build
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001, T002)
2. Complete Phase 2: Foundational (T003, T004) ← CRITICAL gate
3. Complete Phase 3: User Story 1 (T005–T008)
4. **STOP and VALIDATE**: Chat logs a meal, recipe is inferred, dashboard refreshes
5. Ship P1 — the core loop works

### Incremental Delivery

1. T001–T004 → Foundation: agent can already answer "what did I eat?" (empty, but functional)
2. T005–T008 → US1: agent logs meals and infers recipes ← **MVP**
3. T009–T011 → US2: agent gives grounded recommendations
4. T012–T013 → US3: agent answers history questions accurately
5. T014–T017 → US4: agent can delete meals safely
6. T018–T020 → Polish

---

## Notes

- All tool `execute` functions must auth-check first — never trust input alone
- `revalidatePath("/dashboard")` is called by `log_meal` and `delete_meal` only — `save_recipe` is silent
- Recipe save failure must NOT surface to the user — the meal log already succeeded
- The `meal-tools.ts` file grows across phases — implement stubs in T001 so TypeScript never complains about missing exports mid-development
- Run `npm run build` after every phase — catch type errors early
