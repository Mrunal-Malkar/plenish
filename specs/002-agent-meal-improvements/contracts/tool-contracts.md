# Tool Contracts: Agent Meal Improvements

**Branch**: `002-agent-meal-improvements` | **Date**: 2026-04-08

## Changed Interface: `/api/chat` Request Body

The chat route now accepts an additional optional field:

```ts
{
  messages: UIMessage[];   // existing
  tzOffset?: number;       // NEW — browser getTimezoneOffset() value, integer minutes
}
```

`tzOffset` defaults to `0` (UTC) if absent or `NaN`.

---

## Changed Interface: `createMealTools(tzOffsetMinutes: number)`

Replaces the previous named exports (`getMealsTool`, `logMealTool`, etc.). Returns an object with all five tools.

```ts
function createMealTools(tzOffsetMinutes: number): {
  getMealsTool: Tool;
  logMealTool: Tool;
  saveRecipeTool: Tool;
  deleteMealTool: Tool;
  updateMealTool: Tool;   // NEW
}
```

---

## New Tool: `update_meal`

### Input Schema

```ts
{
  meal_id:   string;         // UUID — must come from a prior get_meals call
  log_text?: string;         // min 1, max 500 — new description (optional)
  meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'snack';  // optional
}
```

At least one of `log_text` or `meal_type` must be provided (enforced via Zod `.refine()`).

### Output Schema

```ts
// Success
{ success: true; meal_id: string; updated: { log_text?: string; meal_type?: string } }

// Failure
{ success: false; error: string }
```

### Preconditions (enforced by system prompt + tool description)

1. `get_meals` must have been called in the current turn to obtain `meal_id`.
2. The agent must have shown the user the current entry and the proposed change.
3. The user must have explicitly confirmed before `update_meal` is called.

---

## Modified Tool: `get_meals`

Behavior change only — input/output schema unchanged.

**Before**: "today" window = `00:00:00 UTC → now UTC`  
**After**: "today" window = `00:00:00 local → 23:59:59 local`, expressed as UTC timestamps using the provided `tzOffsetMinutes`

---

## Modified Tool: `log_meal`

Behavior change only — input/output schema unchanged.

**Before**: `eaten_at` default = `new Date().toISOString()` (UTC)  
**After**: `eaten_at` default unchanged (still UTC ISO string) — UTC storage is correct; timezone only affects query windowing, not the stored timestamp.

> Note: `log_meal`'s `eaten_at` default remains server-side UTC. The timezone fix only applies to how `get_meals` interprets "today"/"yesterday". Storing in UTC and querying with local-adjusted windows is the correct approach.
