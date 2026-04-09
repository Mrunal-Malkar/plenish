# Data Model: Agent Meal Improvements

**Branch**: `002-agent-meal-improvements` | **Date**: 2026-04-08

## No Schema Changes

This feature makes no changes to the database schema. All work is in the application layer.

The relevant existing entity:

### `meal_logs`

| Column | Type | Mutable by this feature |
|--------|------|------------------------|
| `id` | uuid PK | No (used as lookup key) |
| `user_id` | uuid FK → `public.users` | No (used in `.match()` for ownership) |
| `log_text` | text | **Yes** — `updateMealTool` may update this |
| `meal_type` | varchar ('breakfast'\|'lunch'\|'dinner'\|'snack') | **Yes** — `updateMealTool` may update this |
| `eaten_at` | timestamptz | No (read for date windowing) |
| `recipe_ids` | uuid[] | No |

RLS policies already restrict all writes to rows where `user_id = auth.uid()`. No RLS changes needed.

## Runtime Data: UTC Offset

Ephemeral — never persisted.

| Field | Type | Source | Lifetime |
|-------|------|--------|---------|
| `tzOffset` | `number` (integer minutes) | `new Date().getTimezoneOffset()` in browser | Per-request; discarded after tool execution |

Sign convention: `getTimezoneOffset()` returns `UTC − local` in minutes.
- UTC-5 → `300`
- UTC+2 → `-120`
- UTC+5:30 → `-330`

Window calculation:
```
localDayStartUTC = Date.UTC(year, month, day, 0, 0, 0) - tzOffset * 60_000
localDayEndUTC   = localDayStartUTC + 86_400_000
```
