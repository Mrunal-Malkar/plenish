# Plenish Database Schema

We are using Supabase (PostgreSQL + pgvector).

## Core Tables

### `public.users`
Automatically managed by Supabase Auth (`auth.users`), but we track public profiles here.
- `id` (uuid) PK, references `auth.users`
- `email` (varchar)
- `created_at` (timestamptz)
- `default_language` (varchar) default 'es'

> **Sync requirement**: All other tables FK reference `public.users`, NOT `auth.users`. A trigger (`on_auth_user_created` via `handle_new_user()`) auto-inserts a row into `public.users` whenever a new auth user is created — see `supabase/migrations/00003_user_profile_trigger.sql`. The auth callback also upserts on every login to cover users created before the trigger existed.

### `public.recipes` (Master Recipe Book)
**Purpose:** Stores exact, structured recipes. These can be global (system-provided) or user-created.
- `id` (uuid) PK
- `user_id` (uuid, nullable) references `public.users` (Null if it's a generic system recipe)
- `name` (varchar) (e.g., "Tacos al Pastor")
- `description` (text)
- `language` (varchar) ('es', 'en') default 'es'
- `ingredients` (text[]) – Array of ingredient strings 
- `instructions` (text[]) – Array of step-by-step instructions
- `embedding` (vector(1536)) – AI vector representation of the recipe for similarity search.

> **Agent-created recipes**: User-owned recipes (`user_id IS NOT NULL`) are created automatically by the AI agent via the `save_recipe` tool when it infers a recipe from a meal description. The recipe reflects the user's specific version of the dish, including any substitutions they mentioned. Global recipes (`user_id IS NULL`) are system-provided and not yet populated.

### `public.meal_logs` (What you actually ate)
**Purpose:** A historical log of what the user consumed. It can be a simple description ("Tacos and Cochinita") and optionally link to multiple recipes.
- `id` (uuid) PK
- `user_id` (uuid) references `public.users`
- `log_text` (text) (e.g., "Ate some Tacos al Pastor and a bit of Cochinita Pibil")
- `meal_type` (varchar) ('breakfast', 'lunch', 'dinner', 'snack')
- `recipe_ids` (uuid[]) – Pointers to `public.recipes`. Populated when user confirms a recipe link.
- `nutrition` (jsonb, nullable) – Sparse structured compliance data extracted at log time. Shape:
  ```json
  {
    "food_groups": ["proteinas", "hidratos"],
    "protein_type": "eggs",
    "servings": { "dairy": 1, "grains": 1, "eggs": 1 },
    "has_occasional_food": false,
    "portion_confidence": "estimated"
  }
  ```
  `servings` is sparse — only non-zero categories are stored. `portion_confidence`: `"from_recipe"` | `"stated"` | `"estimated"`. Null for meals logged before this feature.
- `inferred_ingredients` (text[], nullable) – AI-inferred ingredient strings for unlinked meals (e.g. `["1 arepa (60g)", "1 huevo mediano", "40g queso feta"]`). Cleared when a recipe is created and linked via `recipe_ids`.
- `eaten_at` (timestamptz) – Date/time this meal was taken.

### `public.weekly_plan`
**Purpose:** Represents a specific 7-day schedule for a user.
- `id` (uuid) PK
- `user_id` (uuid) references `public.users`
- `start_date` (date)
- `end_date` (date)

### `public.plan_meals`
**Purpose:** Represents a single scheduled "slot" in a given weekly plan (e.g., "Tuesday's Lunch").
- `id` (uuid) PK
- `plan_id` (uuid) references `public.weekly_plan`
- `suggested_text` (varchar) (A general suggestion text)
- `recipe_id` (uuid, nullable) references `public.recipes` (If a specific recipe was recommended)
- `day_of_week` (int) 0-6
- `meal_type` (varchar) ('breakfast', 'lunch', 'dinner', 'snack')
- `status` (varchar) ('planned', 'eaten', 'skipped', 'replaced')

### `public.user_diet_profiles` (Per-user diet configuration)
**Purpose:** Stores each user's diet targets, restrictions, and portion size defaults. Replaces hardcoded Nestle Menu Planner values in the system prompt — loaded at request time so values are per-user and updatable.
- `id` (uuid) PK
- `user_id` (uuid, unique) references `public.users`
- `daily_targets` (jsonb) – Min/max serving targets per daily category (dairy, fruit_veg, grains, olive_oil, water).
- `weekly_targets` (jsonb) – Min/max serving targets per weekly category (fish, legumes, meat, eggs, nuts).
- `restrictions` (jsonb) – `{ no_repeat_hours, occasional_foods[], protein_rotation[] }`.
- `serving_sizes` (jsonb) – Food keyword → `{ category, count }` map used for portion inference (e.g. `"arepa": { "category": "grains", "count": 1 }`).
- `implicit_ingredients` (jsonb) – Per-dish ingredient defaults for this user (e.g. `{ "arepa": ["mantequilla"] }`). Future work: active application in logMealTool.
- `created_at` / `updated_at` (timestamptz)

> **Auto-created**: A trigger (`on_user_created_diet_profile`) inserts a default row (Nestle Menu Planner values) whenever a new `public.users` row is created.

## Extension Requirements
- Need `CREATE EXTENSION IF NOT EXISTS vector;` enabled on Supabase.
- A match function (e.g., `match_recipes`) to calculate similarity distance (future work — current recipe search uses ilike).
