import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns the configured AI language model based on PLENISH_AI_PROVIDER env var.
 * Defaults to Google Gemini Flash.
 *
 * Supported values:
 *   - "google"    → gemini-2.5-flash (default)
 *   - "openai"    → gpt-4o-mini
 */
export function getAIModel(): LanguageModel {
  const provider = process.env.PLENISH_AI_PROVIDER ?? 'google';

  switch (provider) {
    case 'openai': {
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return openai('gpt-4o-mini');
    }
    case 'google':
    default: {
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });
      return google('gemini-2.5-flash');
    }
  }
}

// ---------------------------------------------------------------------------
// Diet profile types (mirrors user_diet_profiles table)
// ---------------------------------------------------------------------------

interface ServingTarget { min?: number; max?: number }

interface DietProfile {
  daily_targets:  Record<string, ServingTarget>;
  weekly_targets: Record<string, ServingTarget>;
  restrictions: {
    no_repeat_hours: number;
    occasional_foods: string[];
    protein_rotation: string[];
  };
  serving_sizes: Record<string, { category: string; count: number }>;
}

// Nestle Menu Planner defaults — used when no DB profile exists yet.
const DEFAULT_PROFILE: DietProfile = {
  daily_targets: {
    dairy:     { min: 2, max: 4 },
    fruit_veg: { min: 4, max: 5 },
    grains:    { min: 4, max: 6 },
    olive_oil: { min: 3, max: 6 },
    water:     { min: 4, max: 8 },
  },
  weekly_targets: {
    fish:    { min: 3 },
    legumes: { min: 3 },
    meat:    { max: 4 },
    eggs:    { max: 4 },
    nuts:    { min: 3, max: 7 },
  },
  restrictions: {
    no_repeat_hours: 48,
    occasional_foods: ['sweets', 'pastries', 'soft drinks', 'sausages', 'cold cuts'],
    protein_rotation: ['white_meat', 'legumes', 'fish_blue', 'fish_white', 'red_meat'],
  },
  serving_sizes: {
    arepa:          { category: 'grains',      count: 1 },
    huevo:          { category: 'eggs',        count: 1 },
    queso:          { category: 'dairy',       count: 1 },
    pollo:          { category: 'meat',        count: 1 },
    'carne molida': { category: 'meat',        count: 1 },
    pasta:          { category: 'grains',      count: 1 },
    arroz:          { category: 'grains',      count: 1 },
    cuscus:         { category: 'grains',      count: 1 },
    brocoli:        { category: 'vegetables',  count: 1 },
    champinones:    { category: 'vegetables',  count: 1 },
    mandarina:      { category: 'fruit',       count: 1 },
    anchoas:        { category: 'fish',        count: 1 },
    salmon:         { category: 'fish',        count: 1 },
    pipas:          { category: 'nuts',        count: 1 },
    lentejas:       { category: 'legumes',     count: 1 },
    garbanzos:      { category: 'legumes',     count: 1 },
  },
};

// ---------------------------------------------------------------------------
// getSystemPrompt — async, loads diet profile from DB
// ---------------------------------------------------------------------------

export async function getSystemPrompt(
  tzOffsetMinutes: number,
  userId: string,
  supabase: SupabaseClient,
): Promise<string> {
  // Resolve current local time for the user
  const serverNow = new Date();
  const localMs   = serverNow.getTime() - tzOffsetMinutes * 60_000;
  const localNow  = new Date(localMs);
  const dateStr   = localNow.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
  const timeStr = localNow.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  });

  // Load user's diet profile from DB; fall back to defaults if not found
  const { data: profileRow } = await supabase
    .from('user_diet_profiles')
    .select('daily_targets, weekly_targets, restrictions, serving_sizes')
    .eq('user_id', userId)
    .single();

  const profile: DietProfile = profileRow
    ? {
        daily_targets:  profileRow.daily_targets  as DietProfile['daily_targets'],
        weekly_targets: profileRow.weekly_targets as DietProfile['weekly_targets'],
        restrictions:   profileRow.restrictions   as DietProfile['restrictions'],
        serving_sizes:  profileRow.serving_sizes  as DietProfile['serving_sizes'],
      }
    : DEFAULT_PROFILE;

  return buildSystemPrompt(`Today is ${dateStr} at ${timeStr}.`, profile);
}

// ---------------------------------------------------------------------------
// buildSystemPrompt — injects diet profile values dynamically
// ---------------------------------------------------------------------------

function formatTargets(targets: Record<string, ServingTarget>): string {
  return Object.entries(targets)
    .map(([cat, t]) => {
      const parts = [];
      if (t.min !== undefined) parts.push(`min: ${t.min}`);
      if (t.max !== undefined) parts.push(`max: ${t.max}`);
      return `  ${cat}: { ${parts.join(', ')} }`;
    })
    .join('\n');
}

function formatServingSizes(sizes: Record<string, { category: string; count: number }>): string {
  return Object.entries(sizes)
    .map(([food, { category, count }]) => `  "${food}" → ${count} ${category} serving`)
    .join('\n');
}

function buildSystemPrompt(dateLine: string, profile: DietProfile): string {
  return `${dateLine}

You are Plenish, a friendly and knowledgeable AI meal tracking and planning assistant with a focus on Spanish and Latin cuisine. You respond naturally in the same language the user uses (Spanish or English). Keep responses concise and practical.

## Nutrition Guidelines (from user's diet profile)

### Daily targets
${formatTargets(profile.daily_targets)}

### Weekly targets
${formatTargets(profile.weekly_targets)}

### Restrictions
- Do not repeat the same dish within ${profile.restrictions.no_repeat_hours} hours.
- Occasional foods (recommend rarely): ${profile.restrictions.occasional_foods.join(', ')}.
- Weekly protein rotation order: ${profile.restrictions.protein_rotation.join(' → ')}.

**Three food groups** — every main meal (lunch, dinner) should cover all three:
- Vitaminas: vegetables, fruit, and greens (vitamins, minerals, fiber)
- Proteínas: meat, fish, eggs, and legumes (muscle repair and growth)
- Hidratos: pasta, potato, rice — whole grain preferred (sustained energy)

**Meal structure rules:**
- Breakfast: 1 dairy + 1 fruit + 1 whole grain cereal portion
- Mid-morning / afternoon snack: dairy + fruit OR a small sandwich
- Lunch & dinner: cover all three food groups
- Sweets and desserts: occasional only — not a daily recommendation

## Portion Size Defaults (use when user does not state quantities)
${formatServingSizes(profile.serving_sizes)}

## Tool Usage

### log_meal
1. Infer nutrition (food_groups, protein_type, servings, has_occasional_food, portion_confidence) and inferred_ingredients at call time — use the portion defaults above.
2. After the tool returns, check recipe_suggestion:
   - **If present**: show preview — "Encontré tu receta '[name]': [ingredients list]. ¿La vinculo a este registro?"
     - User confirms → call update_meal({ meal_id, recipe_id })
     - User declines → keep inferred_ingredients, offer save_recipe instead
   - **If null and ≥2 ingredients inferred**: show preview — "¿Guardo '[dish]' como receta con estos ingredientes? [inferred_ingredients list]"
     - User confirms → call save_recipe({ ..., meal_id })
     - User declines → leave inferred_ingredients on the meal log
3. Always show inferred servings after logging so the user can correct them:
   "Porciones registradas: [list]. ¿Es correcto?"
   - User corrects → call update_meal({ meal_id, nutrition_patch })

### get_daily_summary
- Use for: recommendations, compliance checks, "¿cómo voy hoy?", "¿qué me falta?".
- Read daily/weekly consumed vs. targets; identify gaps from the numbers; recommend what fills them.
- Do NOT use get_meals for these queries.

### get_meals
- Use for: "¿qué comí hoy/ayer/esta semana?" — human-readable meal list display only.

### Recommendation flow
1. Call get_daily_summary(period="today")
2. Read consumed vs. targets; identify missing categories
3. Also call get_daily_summary(period="week") if checking weekly protein rotation or legumes/fish/nuts
4. Recommend a meal that fills the gaps; briefly explain why

### Deletion rules
1. Call get_meals to find the candidate entry
2. Show user: description + time of what you intend to delete
3. Ask for explicit confirmation before calling delete_meal
4. NEVER call delete_meal without confirmed user approval

### Edit / Update rules
1. Call get_meals to find the candidate entry
2. Show user: current values + proposed change
3. Ask for explicit confirmation before calling update_meal for text/type edits
4. NEVER call update_meal for content edits without confirmed user approval
5. Only update the fields the user mentioned — leave others unchanged`;
}
