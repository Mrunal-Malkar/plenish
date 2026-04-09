# Research: Agent Meal Improvements

**Branch**: `002-agent-meal-improvements` | **Date**: 2026-04-08

## Decision 1: How to pass UTC offset from client to AI tools

**Decision**: Use `useChat({ body: { tzOffset } })` — the Vercel AI SDK merges the `body` option into every request payload. The chat route reads `tzOffset` from `req.json()` alongside `messages`.

**Rationale**: 
- `useChat` already has a `body` option designed for exactly this: injecting per-session metadata into every AI request without modifying message content.
- `new Date().getTimezoneOffset()` is called once at component mount (stable within a session — timezones don't change mid-session).
- The value is ephemeral — never stored, never touches the database.
- No new API surface required; the existing `/api/chat` route just destructures one more field.

**Alternatives considered**:
- *HTTP header* — Works but non-standard for this pattern; would require CORS header config.
- *Embed in system prompt only* — Already done for display date, but tools compute UTC window server-side and need the numeric offset, not a formatted string.
- *Supabase user metadata* — Overkill; timezone is a browser property, not a user preference to persist.

---

## Decision 2: How to make tools timezone-aware without breaking their static shape

**Decision**: Refactor `meal-tools.ts` exports from static `tool()` objects to a single factory function `createMealTools(tzOffsetMinutes: number)` that returns all tools closed over the offset.

**Rationale**:
- The Vercel AI SDK `tool()` objects are plain objects with an `execute` function — there's no built-in mechanism for per-request context injection other than closures.
- A factory is the idiomatic TypeScript pattern: keeps all tool definitions co-located, fully typed, and the calling site (`route.ts`) stays clean.
- Only `getMealsTool` and `logMealTool` use date math; `saveRecipeTool`, `deleteMealTool`, and the new `updateMealTool` don't need the offset but are included in the factory return for a consistent interface.

**Alternatives considered**:
- *Module-level mutable variable* — Anti-pattern; not safe under concurrent requests.
- *Pass offset as a tool input parameter* — Would require the AI model to "know" to pass the offset, which is unreliable and leaks infrastructure concern into the prompt.

---

## Decision 3: updateMealTool confirm-before-act pattern

**Decision**: Mirror the `deleteMealTool` pattern exactly:
1. System prompt rule: call `get_meals` first, show the user the current entry and proposed change, require explicit "yes" before calling `update_meal`.
2. Tool description: explicitly states it must only be called after confirmed user approval.
3. Tool inputs: `meal_id` (uuid, from `get_meals`), optional `log_text`, optional `meal_type`.

**Rationale**: 
- Consistency with existing delete flow (Constitution V: Consistency Over Cleverness).
- The model already respects this pattern for delete — adding the same wording for update leverages trained behavior.
- Partial updates (only `log_text` OR only `meal_type`) are supported via optional fields, so the user doesn't need to re-state unchanged values.

**Alternatives considered**:
- *Allow silent update if context is unambiguous* — Rejected; SC-002 requires 100% confirmation rate.
- *Separate tools for update_text and update_type* — Unnecessary complexity; one tool with optional fields is cleaner.

---

## Decision 4: UTC offset sign convention

**Decision**: Use `new Date().getTimezoneOffset()` as-is (returns a **positive** number for UTC-behind zones, e.g., UTC-5 → `+300`). Apply as: `localMidnight = utcMidnight - offsetMinutes * 60000`.

**Rationale**: 
- `getTimezoneOffset()` returns the offset as `UTC - local` in minutes, which is the inverse of the common "+/-HH:MM" notation. A user at UTC-5 gets `300`, not `-300`.
- Applying `utcMs - offset * 60000` correctly shifts the window: for UTC-5 (`offset=300`), midnight UTC-5 = `00:00 local = 05:00 UTC`, which is `Date.UTC(y,m,d,0,0,0) - 300*60000 = Date.UTC(y,m,d,0,0,0) - 18000000ms`. ✅
- Half-hour offsets (e.g., UTC+5:30 → `offset = -330`) work correctly since arithmetic is in milliseconds.

**Alternatives considered**:
- *IANA timezone string* — More precise but requires a timezone database on the server; unnecessary for simple window math.
