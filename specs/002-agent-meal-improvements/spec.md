# Feature Specification: Agent Meal Improvements

**Feature Branch**: `002-agent-meal-improvements`  
**Created**: 2026-04-08  
**Status**: Draft  
**Input**: User description: "Agents improvements, let's include the previous analysis of the proposed 002 meal edit + utc timezone fix"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Edit a Logged Meal via Chat (Priority: P1)

A user realizes they logged the wrong meal type or misspelled a meal description and asks the AI assistant to correct it. The agent finds the entry, shows the user what it intends to change, waits for confirmation, and updates the record.

**Why this priority**: Correcting mistakes is a core data quality need. Without edit, the only workaround is delete-and-relog, which is clunky and breaks the conversation flow the product is built around.

**Independent Test**: Can be fully tested by sending a chat message like "Cambia el almuerzo de hoy a ensalada de lentejas" and verifying the record updates after confirmation, with no code path depending on the UI edit form.

**Acceptance Scenarios**:

1. **Given** a logged meal exists, **When** the user asks the agent to change its description, **Then** the agent calls `get_meals`, presents the current entry, and asks for explicit confirmation before updating.
2. **Given** the agent presents the change and the user confirms, **Then** the meal record is updated and the dashboard reflects the new values.
3. **Given** the agent presents the change and the user declines, **Then** no update is made and the agent confirms the cancellation.
4. **Given** the user asks to edit a meal that does not exist, **Then** the agent says it could not find a matching entry and offers to show recent meals.

---

### User Story 2 — "Today" Respects User's Local Date (Priority: P2)

When a user in a non-UTC timezone asks "what did I eat today?" or "log my breakfast", the agent correctly interprets "today" and "yesterday" as calendar days in the user's local timezone, not UTC. A user at UTC−5 eating dinner at 8pm their time will see that meal included in "today's" results.

**Why this priority**: A timezone-unaware system silently returns wrong data without any error, which erodes user trust in the product. However it only affects users in non-UTC timezones at boundary hours, so it is lower priority than the edit capability.

**Independent Test**: Can be fully tested by a user in a UTC-offset timezone logging a meal near midnight local time and then asking "what did I eat today?" — the meal must appear.

**Acceptance Scenarios**:

1. **Given** a user in UTC−5 logs a meal at 11pm their local time (04:00 UTC next day), **When** they ask "what did I eat today?", **Then** the agent returns that meal as part of today's log.
2. **Given** a user asks "what did I eat yesterday?", **Then** the agent returns meals from yesterday in the user's local calendar day, not UTC day.
3. **Given** a user's timezone offset cannot be determined, **Then** the system falls back to UTC without error.

---

### Edge Cases

- What happens when the user tries to edit a meal that was already deleted in another session?
- What if the user edits a meal that was used as the basis for a recipe saved by the agent?
- What if the user's browser reports an unusual timezone offset (e.g., half-hour offsets like UTC+5:30)?
- What if the agent's `update_meal` call fails mid-confirmation (network error)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The AI agent MUST expose an `update_meal` tool that accepts a meal ID, an optional new description, and an optional new meal type.
- **FR-002**: The agent MUST call `get_meals` before any update, show the user the exact current entry, and require explicit confirmation before calling `update_meal`.
- **FR-003**: The agent MUST never call `update_meal` without a confirmed meal ID obtained from `get_meals`.
- **FR-004**: The system MUST expose an `updateMeal` server action that updates `log_text` and/or `meal_type` for a meal owned by the authenticated user.
- **FR-005**: The chat route MUST receive the user's UTC offset (in minutes) on each request and pass it to the meal query tools.
- **FR-006**: `get_meals` MUST use the provided UTC offset to compute "today" and "yesterday" as local calendar days.
- **FR-007**: `log_meal` MUST use the provided UTC offset when defaulting `eaten_at` to the current local time.
- **FR-008**: If no UTC offset is provided, tools MUST default to UTC (offset = 0) without error.

### Key Entities

- **MealLog**: Represents a single meal entry. Key mutable fields: `log_text` (free-text description), `meal_type` (breakfast/lunch/dinner/snack), `eaten_at` (timestamp). Ownership scoped to `user_id`.
- **UTC Offset**: An integer representing the user's browser timezone offset in minutes (e.g., −300 for UTC−5). Ephemeral — passed per request, never persisted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can correct a meal entry via chat in under 30 seconds from identifying the mistake.
- **SC-002**: 100% of agent `update_meal` calls are preceded by a user confirmation step — no silent edits.
- **SC-003**: Users in any UTC-offset timezone receive accurate "today" and "yesterday" meal results at all hours of the day, including within one hour of midnight local time.
- **SC-004**: No existing meal log is modified without the authenticated owner's explicit confirmation in the chat.

## Assumptions

- The user's browser timezone offset is available via `new Date().getTimezoneOffset()` on the client side and can be sent as part of the chat message payload or a request header.
- UTC offset is treated as ephemeral session data — it is not stored in the database.
- Editing a meal does not retroactively update any recipe that the agent may have inferred from that meal; recipes are independent records.
- The `meal_logs` table schema requires no migration — `log_text`, `meal_type`, and `eaten_at` are already mutable columns with RLS scoped to `user_id`.
- Half-hour and quarter-hour UTC offsets (e.g., UTC+5:30, UTC+5:45) must be handled correctly since the browser returns them in minutes.
