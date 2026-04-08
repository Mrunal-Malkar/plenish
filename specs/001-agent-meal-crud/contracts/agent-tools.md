# Agent Tool Contracts

**Feature**: `001-agent-meal-crud` | **Date**: 2026-04-07

These are the interfaces the AI agent exposes as callable tools inside the chat session. All tools execute server-side within the `/api/chat` route handler. The agent decides autonomously which tool to call based on user intent.

---

## Tool: `log_meal`

**Purpose**: Record a meal the user describes in conversation to their meal history.

**When called**: User states they ate something (e.g., "I had tacos for lunch", "acabo de desayunar avena").

### Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `log_text` | string | ✅ | Free-text meal description as understood from the conversation |
| `meal_type` | `"breakfast" \| "lunch" \| "dinner" \| "snack"` | ✅ | Meal type inferred from context or time of day |
| `eaten_at` | string (ISO 8601) | ❌ | Timestamp of when the meal was eaten; defaults to current time |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the meal was saved |
| `meal_id` | string (uuid) | ID of the created record |
| `log_text` | string | The text that was saved (for agent confirmation) |
| `meal_type` | string | The meal type that was saved |
| `error` | string | Present only on failure |

### Behavior

- Always saves to the authenticated user's account — no `user_id` in input
- On success: agent confirms back to user what was recorded
- On failure: agent informs user and suggests they try again
- Triggers dashboard refresh (cache revalidation)

---

## Tool: `get_meals`

**Purpose**: Retrieve the authenticated user's meal history for a given time period.

**When called**: User asks what they ate, asks for a recommendation, or the agent needs history context.

### Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | `"today" \| "yesterday" \| "week"` | ❌ | Time window to query; defaults to `"today"` |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `meals` | array | List of meal records |
| `meals[].id` | string (uuid) | Meal ID (used as input to `delete_meal`) |
| `meals[].log_text` | string | Meal description |
| `meals[].meal_type` | string | Breakfast / lunch / dinner / snack |
| `meals[].eaten_at` | string (ISO 8601) | When it was eaten |
| `count` | number | Total number of meals returned |

### Behavior

- Returns meals in reverse chronological order (most recent first)
- Empty array (not error) when no meals found for the period
- Agent uses the result to: answer history questions, provide context for recommendations, identify targets for deletion

---

## Tool: `delete_meal`

**Purpose**: Remove a specific meal entry from the user's history.

**When called**: Only after the agent has retrieved and confirmed the target meal with the user via `get_meals`.

### Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `meal_id` | string (uuid) | ✅ | ID of the meal log entry to delete |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the meal was deleted |
| `error` | string | Present only on failure |

### Behavior

- Agent MUST present the meal to be deleted and receive user confirmation BEFORE calling this tool
- Deletes only if `meal_id` belongs to the authenticated user (RLS enforced at DB; user_id filter applied in code)
- On success: agent confirms deletion to user
- On failure: agent informs user; no retry without user re-requesting
- Triggers dashboard refresh (cache revalidation)

---

## Tool: `save_recipe`

**Purpose**: Infer and persist a recipe from a meal description — capturing the dish name, ingredients, and optionally preparation steps as the user described or implied them.

**When called**: Opportunistically after a meal is logged, when the agent can infer ingredients with reasonable confidence from the dish name or user description. Never blocks meal logging if inference fails.

### Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | ✅ | Dish name (e.g., "Reina Pepiada", "Tortilla de patatas") |
| `description` | string | ✅ | Short description of the dish as the user makes it |
| `ingredients` | string[] | ✅ | List of ingredients inferred or described. Each item is a plain string (e.g., "60g harina de maíz cruda", "aguacate", "yogur natural") |
| `instructions` | string[] | ❌ | Step-by-step preparation if inferable. Empty array if unknown. |
| `language` | `"es" \| "en"` | ❌ | Language of the recipe content; defaults to `"es"` |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the recipe was saved |
| `recipe_id` | string (uuid) | ID of the created recipe record |
| `name` | string | The name that was saved |
| `ingredient_count` | number | How many ingredients were captured |
| `error` | string | Present only on failure; meal log is unaffected |

### Behavior

- Saves to `public.recipes` with `user_id` set to the authenticated user (user-owned, not global)
- **Ingredients are mandatory** — if the agent cannot infer at least 2 ingredients, it does NOT call this tool
- The saved recipe reflects the user's described version, not a canonical recipe (their substitutions, preferences, and quantities are what gets saved)
- On success: agent may briefly mention it noted the recipe (optional — keep UX light, don't make it feel like a bureaucratic step)
- On failure: silent — meal log already succeeded; agent does not surface recipe save errors to the user
- Does NOT trigger dashboard cache revalidation (recipes are not shown on dashboard v1)

### Inference Examples

| User says | Agent infers |
|-----------|-------------|
| "comí reina pepiada" | name: Reina Pepiada, ingredients: [harina de maíz, sal, mantequilla, pollo, aguacate, mayonesa] |
| "comí reina pepiada, la hago con yogur en vez de mayo" | Same but ingredients: [..., yogur natural] — not mayonesa |
| "desayuné avena con plátano" | name: Avena con plátano, ingredients: [avena, plátano, leche o agua] |
| "just had a coffee" | → Does NOT call save_recipe (no meaningful ingredient composition) |

---

## Multi-Step Flow Constraints

- `maxSteps: 7` — supports: log meal → save recipe → confirm (3 tool steps + intermediate model turns + final response)
- Agent may call `log_meal` followed immediately by `save_recipe` in the same turn
- Agent may call `get_meals` followed by `delete_meal` in the same turn (after confirmation)
- Agent may call `get_meals` followed by a text response with recommendations (no second tool needed)
- Agent does NOT call `delete_meal` without first calling `get_meals` to identify the target
- Agent does NOT call `save_recipe` if ingredients cannot be reasonably inferred (≥ 2 ingredients required)

---

## Security Constraints

- No tool accepts `user_id` as input — identity is always resolved server-side from the auth session
- All tools return an error result (not throw) on auth failure — agent communicates failure gracefully
- RLS policies on `meal_logs` serve as the authoritative access control layer
