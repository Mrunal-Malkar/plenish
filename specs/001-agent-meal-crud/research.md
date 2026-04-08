# Research: Conversational Meal Management & Context-Aware Recommendations

**Branch**: `001-agent-meal-crud` | **Date**: 2026-04-07

## Conflict Resolution

### Diet Guidelines — Resolved via Shared Nutrition Guide (v1)

- **Conflict**: `spec.md` listed "Diet Guidelines" as a Key Entity stored per user. `docs/database_schema.md` has no such table.
- **Decision**: V1 uses a shared diet guideline based on the [Nestlé Menú Planner guide](https://www.nestlemenuplanner.es/) encoded directly into the system prompt. No DB table required. Per-user personalization (calorie targets, macros, restrictions) is a future feature.
- **Spec assumption updated**: "Diet guidelines are stored per user in the existing database" → corrected to: "V1 uses shared balanced nutrition principles from the Menú Planner guide, embedded in the system prompt. Per-user diet goals are a future feature."
- **Impact on FR-004**: Requirement updated — "factor in user's diet guidelines" becomes "factor in meal history and the shared balanced nutrition principles in the system prompt."

**Menú Planner principles to encode in system prompt**:

| Food Group | Foods | Role |
|------------|-------|------|
| Vitaminas | Vegetables, fruit, greens | Vitamins, minerals, fiber — low calorie |
| Proteínas | Meat, fish, eggs, legumes | Cell repair and muscle growth |
| Hidratos | Pasta, potato, rice (whole grain preferred) | Complex carbs, sustained energy |

Weekly balance rules:
- Each lunch and dinner should cover all three groups
- Breakfast: 1 dairy + 1 fruit + 1 whole grain cereal portion
- Mid-morning / afternoon snack: dairy + fruit OR small sandwich
- Protein weekly rotation: white meat → legumes → blue fish → white fish → red meat (balanced across 7 days)
- Whole grain versions preferred for carbs
- Sweets and desserts: occasional only

---

## Technical Decisions

### 1. Tool-Calling Pattern (Vercel AI SDK v6)

- **Decision**: Use `streamText` with the `tools` parameter in `/api/chat/route.ts`. Tools have an `execute` function that runs server-side within the Route Handler.
- **Rationale**: AI SDK v6 `streamText` supports `tools` natively. Tool execution is server-side, satisfying the constitution's requirement that mutations are not initiated from client components. `useChat` on the client handles tool result streaming automatically — no client changes needed for tool execution.
- **Key API**: 
  ```ts
  streamText({
    model,
    system: SYSTEM_PROMPT,
    messages,
    tools: { log_meal, get_meals, delete_meal },
    maxSteps: 5, // allow multi-step tool → response flows
  })
  ```
- **Alternatives considered**: Separate `/api/tools/` endpoints called from client — rejected (violates Principle IV); Server Actions called directly — rejected (Server Actions use Next.js form action protocol, not compatible with AI SDK tool calling pattern).

### 2. Tool Location — New Module `src/lib/ai/tools/meal-tools.ts`

- **Decision**: Tool definitions live in `src/lib/ai/tools/meal-tools.ts`, imported by the chat route.
- **Rationale**: Keeps route handler thin. Tools are pure server-side logic, not UI components. Separating them makes individual tools testable in isolation and reusable across future routes (e.g., a dedicated recommendations route).
- **Alternatives considered**: Inline tools in `route.ts` — rejected (file would grow unwieldy as tool count increases); Reusing Server Actions directly — technically possible (Server Actions are importable async functions) but they include `revalidatePath` calls that behave differently outside Server Action context.

### 3. Database Operations Inside Tool Execute Functions

- **Decision**: Tool `execute` functions use `createClient()` from `src/lib/supabase/server.ts` directly, mirroring the pattern in `src/actions/meals.ts`. They do NOT import the Server Action functions.
- **Rationale**: Server Actions are designed for form-based mutation flows. Importing them into tool execute functions would mix concerns. The underlying DB pattern (createClient → getUser → query) is the established project pattern and is replicated in tools.
- **Cache invalidation**: Tool execute functions call `revalidatePath('/dashboard')` after mutations — this works inside Route Handlers in Next.js App Router.

### 4. Meal History Injection for Recommendations

- **Decision**: The `get_meals` tool fetches recent meal history. The agent calls this tool proactively when the user asks for a recommendation, then incorporates the results into its response.
- **Rationale**: Injecting all meal history into every system prompt is wasteful and hits token limits. Tool-based retrieval is on-demand and returns only relevant data.
- **Tool behavior**: `get_meals` accepts an optional `date` parameter (ISO date string). Defaults to today. Can also accept `"week"` to return the last 7 days.
- **Alternatives considered**: Pre-loading meal history into the system prompt on each request — rejected (unnecessary overhead for turns that don't need it); Fine-tuning — out of scope.

### 5. Zod v4 for Tool Parameter Schemas

- **Decision**: Use Zod v4 (`zod@4.3.6`) for tool parameter schemas, consistent with the project's existing dependency.
- **Rationale**: AI SDK v6 accepts Zod schemas directly for tool parameter validation. Zod v4 API is compatible for the object/string/enum usage needed here.
- **Note**: Zod v4 uses `z.string().optional()` the same as v3 for simple schemas. No API incompatibilities expected.

### 6. `maxSteps` and Multi-Turn Tool Flows

- **Decision**: Set `maxSteps: 5` in `streamText`.
- **Rationale**: Without `maxSteps > 1`, the agent calls a tool but cannot generate a follow-up response after the tool result — it would return raw tool output to the client. `maxSteps: 5` allows: user message → tool call → tool result → agent response (3 steps). 5 gives headroom for compound flows (e.g., get history → log meal → confirm).

### 7. Client-Side Tool Result Handling

- **Decision**: No changes to `AIChatBox.tsx` for basic tool support.
- **Rationale**: `useChat` from `@ai-sdk/react` handles tool call/result message parts transparently. Text parts are rendered; tool parts are not rendered (filtered out in the existing `content` extraction logic in `AIChatBox.tsx`). The agent's final text response after tool execution is what the user sees.
- **Future enhancement**: Tool result parts could be rendered as interactive meal cards (product spec mentions "streaming complete React components showing meal cards"). This is a separate UI enhancement, not part of this feature.

---

### 8. Recipe Inference from Meal Descriptions — In Scope for v1

- **Decision**: When a user logs a meal, the agent attempts to infer its recipe (name, ingredients, preparation notes) and save it to `public.recipes` under the user's account. This is a new tool: `save_recipe`.
- **Rationale**: The recipe database is built organically from real interactions — no pre-seeding needed. The ingredients list is the most valuable output: it tells the system what the user actually consumed, enabling future nutritional analysis and similarity search (pgvector).
- **Key design principles**:
  1. **Inference is best-effort**: The agent infers from the dish name + any context provided. If the user says "reina pepiada", the agent knows it's an arepa filled with chicken and avocado. If the user says "I use yogurt instead of mayo", that variant is what gets saved.
  2. **User's version, not canonical**: The recipe saved reflects how the user described making it, not a generic recipe. Example: "arepa: 60g raw corn flour + salt + cheese + butter | filling: chicken + avocado + yogurt" — even if the user didn't spell out every component.
  3. **Meal log ≠ recipe**: The `meal_log` captures the eating event. The `recipe` captures the dish's composition. They are not required to be linked — a user can log "reina pepiada" without the agent successfully finding/creating a recipe, and that's fine. Linking via `meal_logs.recipe_ids` is optional and deferred.
  4. **Ingredients are the priority**: Even if instructions/steps are incomplete, ingredients MUST be captured. They are the nutritional fingerprint of the meal.
  5. **User can refine**: Saved recipes are user-owned (`user_id` set) and editable. The agent's inference is a starting point.

- **Alternatives considered**: Manual recipe entry UI — rejected for v1 (friction, doesn't match conversational model); Only saving recipes the user explicitly describes — rejected (misses implicit knowledge the agent already has about dishes).

- **Scope boundary**: `save_recipe` is called opportunistically after `log_meal` when the agent can infer ingredients with reasonable confidence. It does NOT block the meal log if inference fails. Recipe editing UI is a future feature.

- **Tools updated**: `agent-tools.md` now includes `save_recipe`. `maxSteps` raised to 7 to accommodate: log meal → save recipe → confirm (3 tool steps + response).

---

## Open Questions (Deferred to Future Features)

1. **Per-user diet goals**: Calorie targets, macros, food restrictions — needs a dedicated feature with a DB table and settings UI. V1 uses shared Menú Planner principles.
2. **Recipe editing UI**: Users can refine inferred recipes via the agent (e.g., "update my arepa recipe, I don't add cheese"). Editing via chat is a future enhancement; the data model is ready.
3. **Meal log ↔ recipe linking**: `meal_logs.recipe_ids` exists for future use. Automatic linking (agent matches log to recipe via similarity search) requires the pgvector corpus to be populated first — deferred.
4. **Weekly Plan Integration**: The agent could update `plan_meals` status when a meal is logged — deferred to a weekly plan feature.
