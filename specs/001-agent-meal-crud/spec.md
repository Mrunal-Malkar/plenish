# Feature Specification: Conversational Meal Management & Context-Aware Recommendations

**Feature Branch**: `001-agent-meal-crud`  
**Created**: 2026-04-07  
**Status**: Draft  
**Input**: User description: "Agent, Currently we have a base implementation for agent; we right on chat and have a response. We want to go further, i want the agent to manage the CRUD, using agent tools, that i can use to record meals in the database and to read from database so the food recommendations are based on what it is store in the database and the diet guidelines"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Log a Meal Through Conversation (Priority: P1)

A user tells the assistant in natural language what they just ate — the assistant understands the meal, confirms the details, and records it to the user's meal history without the user needing to fill a form.

**Why this priority**: This is the core loop of the product. Without reliable meal capture through conversation, no other feature (history, recommendations) has data to work with. It replaces the manual log form as the primary input method.

**Independent Test**: Can be fully tested by typing "I just had chicken soup and a bread roll for lunch" in the chat and verifying the meal appears in the user's recent meals list.

**Acceptance Scenarios**:

1. **Given** a logged-in user with no meals today, **When** they tell the assistant "I just had scrambled eggs and orange juice for breakfast", **Then** the assistant confirms what it understood and the meal is saved to the user's history with the correct meal type and timestamp.
2. **Given** a logged-in user, **When** they describe a meal in Spanish (e.g., "acabo de comer enchiladas"), **Then** the assistant understands the message, confirms in the same language, and saves the meal correctly.
3. **Given** the assistant captures a meal, **When** the user confirms, **Then** the meal appears immediately in their recent meals list without a page refresh.

---

### User Story 2 - Context-Aware Food Recommendations (Priority: P2)

A user asks the assistant what they should eat next. The assistant looks at what the user has already eaten today (and recently), compares it against their diet goals, and suggests meals that complement their history and move them toward their goals — not generic suggestions.

**Why this priority**: This is the core value proposition of Plenish. Recommendations that ignore the user's actual eating history are useless. This story completes the feedback loop: log → analyze → recommend.

**Independent Test**: Can be fully tested by logging a breakfast meal, then asking "what should I have for lunch?", and verifying the suggestion accounts for what was already logged and aligns with any diet guidelines on record.

**Acceptance Scenarios**:

1. **Given** a user who logged a high-carb breakfast, **When** they ask for a lunch recommendation, **Then** the assistant suggests options that balance the day nutritionally, referencing the logged meal as context.
2. **Given** a user with diet goals on record (e.g., high protein, low sugar), **When** they ask for a dinner recommendation, **Then** the assistant's suggestion aligns with those guidelines and explains why.
3. **Given** a user with no meals logged today, **When** they ask for a recommendation, **Then** the assistant suggests based solely on diet guidelines and explains that no meals have been logged yet today.
4. **Given** a user who asks in Spanish, **Then** the recommendation is delivered in Spanish.

---

### User Story 3 - Review Meal History Through Conversation (Priority: P3)

A user asks the assistant questions about their recent eating — what they had yesterday, how many meals they've logged this week, or whether they've hit certain nutritional targets. The assistant retrieves this from the user's actual history and answers accurately.

**Why this priority**: Visibility into history builds user trust and enables better decision-making. It also validates that the data captured in P1 is surfaced correctly.

**Independent Test**: Can be fully tested by logging two meals, then asking "what did I eat today?" and verifying the assistant lists the correct meals.

**Acceptance Scenarios**:

1. **Given** a user with meals logged today, **When** they ask "what did I eat today?", **Then** the assistant lists all meals logged for the current day accurately.
2. **Given** a user with no meals logged today, **When** they ask about today's intake, **Then** the assistant indicates no meals have been recorded yet and prompts them to log one.

---

### User Story 4 - Correct or Delete a Meal Through Conversation (Priority: P4)

A user realizes they logged the wrong meal or wants to remove a record. They tell the assistant, which identifies the entry and removes it after confirmation.

**Why this priority**: Data quality is critical for accurate recommendations. Users must be able to fix mistakes without leaving the chat interface.

**Independent Test**: Can be fully tested by logging a meal, then saying "actually, remove that last meal I logged" and verifying it disappears from recent meals.

**Acceptance Scenarios**:

1. **Given** a recently logged meal, **When** the user says "remove the last meal I logged", **Then** the assistant confirms the entry it intends to delete, removes it on confirmation, and acknowledges completion.
2. **Given** the user asks to delete a meal, **When** they decline the confirmation, **Then** no data is changed and the assistant acknowledges the cancellation.

---

### Edge Cases

- What happens when the user describes a meal the assistant cannot recognize or parse (e.g., a regional dish with no description)?
- How does the assistant handle ambiguous meal types — e.g., "I had something at noon" without specifying breakfast, lunch, or snack?
- What if the user asks for a recommendation but has no diet guidelines set — does the assistant use general healthy eating principles or ask for goals first?
- What happens if a meal save fails — does the assistant notify the user and offer to retry?
- What if the user asks to delete a specific meal from several days ago when they have many entries — can the assistant identify the right one?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The assistant MUST be able to record a meal to the user's history when the user describes it in natural language, without requiring the user to use a form.
- **FR-002**: The assistant MUST confirm its interpretation of the meal (name, type, approximate time) before saving, allowing the user to correct it.
- **FR-003**: The assistant MUST read the user's meal history when generating food recommendations — recommendations must never be generic or ignore logged meals.
- **FR-004**: The assistant MUST factor in the user's diet guidelines when generating recommendations, and explain how the suggestion aligns with those guidelines.
- **FR-005**: The assistant MUST be able to answer questions about the user's meal history (today, yesterday, this week) by querying stored data.
- **FR-006**: The assistant MUST be able to delete a meal entry from the user's history upon user request, with a confirmation step before deletion.
- **FR-007**: The assistant MUST support both English and Spanish inputs for all meal operations — logging, querying, and recommendations.
- **FR-008**: All meal data read and written by the assistant MUST be scoped to the currently authenticated user — the assistant cannot access another user's data.
- **FR-009**: The assistant MUST inform the user when a requested action (save or delete) succeeds or fails.
- **FR-010**: When no diet guidelines are configured, the assistant MUST still provide recommendations using general balanced nutrition principles, while prompting the user to set goals for more personalized guidance.

### Key Entities

- **Meal Log**: A record of something a user ate — includes the description, meal type (breakfast, lunch, dinner, snack), and when it was eaten.
- **Diet Guidelines**: The user's nutritional goals and dietary constraints (e.g., calorie target, macros, food restrictions) that shape recommendations.
- **Recommendation**: A suggested meal or food option generated in response to a user query, grounded in the user's meal history and diet guidelines.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can log a meal through conversation in under 30 seconds from description to confirmation.
- **SC-002**: 90% of natural language meal descriptions (in English or Spanish) are correctly interpreted by the assistant on the first attempt.
- **SC-003**: Food recommendations explicitly reference at least one meal from the user's history or one diet guideline in every response — never generic suggestions.
- **SC-004**: A user can ask "what did I eat today?" and receive a correct, complete answer within one conversation turn.
- **SC-005**: A user can delete a logged meal through conversation in under 2 exchanges (request + confirmation).
- **SC-006**: All meal data created or deleted through the assistant reflects accurately in the visual meal history panel without requiring a page reload.

## Assumptions

- Users are authenticated before interacting with the assistant — no anonymous meal logging.
- Diet guidelines are stored per user in the existing database; if none exist, the assistant falls back to general nutrition principles.
- The existing meal history database tables are already in place and accessible to the assistant's data operations.
- Meal editing (modifying a logged entry's details) is out of scope for this version — users can delete and re-log as the correction path.
- The assistant operates within a single conversation session — it does not retain memory between separate chat sessions beyond what is persisted in the database.
- Portion size and exact calorie counting are not required for this version; the assistant records qualitative meal descriptions and meal types.
- The assistant's ability to read history and make recommendations is available in the same chat interface where meals are logged.
