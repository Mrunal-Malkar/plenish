# Data Model: Conversational Meal Management & Context-Aware Recommendations

**Branch**: `001-agent-meal-crud` | **Date**: 2026-04-07

> No new database tables are introduced in this feature. All operations use existing tables.

---

## Existing Entities Used

### MealLog (`public.meal_logs`)

The primary entity read and written by all agent tools.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | uuid | PK, auto-generated | Used as target for delete operations |
| `user_id` | uuid | FK → `public.users`, NOT NULL | Always set from `auth.getUser()` — never passed in |
| `log_text` | text | NOT NULL | Free-text description of what was eaten |
| `meal_type` | varchar | NOT NULL, enum: `breakfast \| lunch \| dinner \| snack` | Must be one of the four values |
| `recipe_ids` | uuid[] | nullable | Optional recipe links — not used in v1 tool calls |
| `eaten_at` | timestamptz | NOT NULL | Defaults to `now()` when logged via agent; can be overridden |

**Validation rules for agent tool input**:
- `log_text`: non-empty string, max 500 characters
- `meal_type`: must match exact enum — agent infers this from natural language (e.g., "lunch", "breakfast")
- `eaten_at`: ISO 8601 timestamp, defaults to current server time if not provided

**Read scope**: Always filtered by `user_id = auth.getUser().id`. RLS enforces this at the DB layer as a second guard.

---

### Recipe (`public.recipes`)

Written by the `save_recipe` tool when the agent infers a dish from a meal description.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | uuid | PK, auto-generated | |
| `user_id` | uuid | FK → `public.users`, nullable | Set to authenticated user — NOT NULL for agent-inferred recipes |
| `name` | varchar | NOT NULL | Dish name as the user describes it (e.g., "Reina Pepiada") |
| `description` | text | NOT NULL | Short description of the user's version of the dish |
| `language` | varchar | NOT NULL, default `'es'` | Language of the recipe content |
| `ingredients` | text[] | NOT NULL | Ingredient strings — this is the nutritional fingerprint |
| `instructions` | text[] | NOT NULL, default `'{}'` | Steps if inferable; empty array if not |
| `embedding` | vector(1536) | nullable | Not populated by agent in v1 — reserved for future similarity search |

**Key design rule — user's version, not canonical**:  
The `ingredients` array captures what THIS user eats, including their substitutions and quantities. Two users logging "reina pepiada" may produce different recipe records. That is correct and intentional.

**Ingredients format**: Plain descriptive strings. Quantity and unit included when mentioned.
```
["60g harina de maíz cruda", "sal", "mantequilla", "pollo desmenuzado", "aguacate", "yogur natural"]
```

**Validation rules for agent tool input**:
- `ingredients`: minimum 2 items required — agent does not call `save_recipe` if fewer can be inferred
- `name`: non-empty, max 200 characters
- `instructions`: may be empty array `[]` — not a failure condition

---

## Tool Parameter Schemas

These are the structured inputs each agent tool accepts. They define what the agent must resolve from natural language before calling the tool.

### `log_meal` tool input

```
{
  log_text:   string   — description of the meal (e.g., "2 chicken tacos and rice")
  meal_type:  "breakfast" | "lunch" | "dinner" | "snack"
  eaten_at?:  string   — ISO 8601 datetime (optional, defaults to now)
}
```

### `get_meals` tool input

```
{
  period: "today" | "yesterday" | "week"  — defaults to "today"
}
```

### `delete_meal` tool input

```
{
  meal_id: string   — UUID of the meal_log entry to delete
}
```

> **Note**: The agent must call `get_meals` first to obtain a `meal_id` before calling `delete_meal`. The agent never guesses IDs.

### `save_recipe` tool input

```
{
  name:         string    — dish name
  description:  string    — short description of the user's version
  ingredients:  string[]  — list of ingredient strings (minimum 2)
  instructions: string[]  — preparation steps (may be empty [])
  language?:    "es" | "en"  — defaults to "es"
}
```

---

## State Transitions

```
User message (natural language)
        ↓
  Agent interprets intent
        ↓
  ┌──────────────────────────────────────────────────────────┐
  │  Intent: log meal     │ → log_meal → INSERT              │
  │                       │   ↓ (if ≥2 ingredients known)   │
  │                       │ → save_recipe → INSERT           │
  │                       │   ↓                              │
  │                       │   confirm to user                │
  ├───────────────────────┼──────────────────────────────────┤
  │  Intent: recommend    │ → get_meals → SELECT             │
  │                       │   → agent responds with          │
  │                       │     history-grounded suggestion  │
  ├───────────────────────┼──────────────────────────────────┤
  │  Intent: view history │ → get_meals → SELECT             │
  │                       │   → agent formats and responds   │
  ├───────────────────────┼──────────────────────────────────┤
  │  Intent: delete meal  │ → get_meals → SELECT             │
  │                       │   → agent confirms target        │
  │                       │ → delete_meal → DELETE           │
  └──────────────────────────────────────────────────────────┘
```

**Delete flow** (enforced by `maxSteps: 7`):
1. Agent calls `get_meals` to retrieve candidates and present them to the user
2. User confirms → agent calls `delete_meal` with the specific `meal_id`

**Log + recipe inference flow** (same turn):
1. Agent calls `log_meal` → meal is saved
2. Agent calls `save_recipe` if it can infer ≥ 2 ingredients → recipe is saved silently
3. Agent confirms the meal to the user (recipe save is not surfaced unless notable)

---

## No Schema Changes Required

The following tables exist and are sufficient:

| Table | Used For | Operations |
|-------|----------|-----------|
| `public.meal_logs` | Meal CRUD | INSERT, SELECT (by date range), DELETE by id |
| `public.recipes` | Recipe inference | INSERT (agent-created, user-owned) |
| `public.users` | Auth identity | `getUser()` only — no direct query |

Tables NOT used by this feature: `public.weekly_plan`, `public.plan_meals`
