import { tool } from 'ai';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  ServingCategoryEnum,
  NutritionSchema,
} from '@/lib/ai/nutrition-schemas';

// ---------------------------------------------------------------------------
// createMealTools(tzOffsetMinutes)
// Factory that returns all meal tools closed over the user's UTC offset.
// tzOffsetMinutes: value of new Date().getTimezoneOffset() from the browser
//   (positive = behind UTC, e.g. UTC-5 → 300; negative = ahead, UTC+2 → -120)
// ---------------------------------------------------------------------------
export function createMealTools(tzOffsetMinutes: number) {
  const tz = Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0;

  // ---------------------------------------------------------------------------
  // Shared timezone helper — returns { rangeStart, rangeEnd } ISO strings
  // ---------------------------------------------------------------------------
  function getDateRange(period: 'today' | 'yesterday' | 'week') {
    const now = new Date();
    const offsetMs = tz * 60_000;

    const localNowMs = now.getTime() - offsetMs;
    const localDate = new Date(localNowMs);

    const localDayStartMs = Date.UTC(
      localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(),
      0, 0, 0, 0,
    ) + offsetMs;

    if (period === 'today') {
      return { rangeStart: new Date(localDayStartMs).toISOString(), rangeEnd: now.toISOString() };
    }

    if (period === 'yesterday') {
      const yesterdayStartMs = localDayStartMs - 86_400_000;
      const yesterdayEndMs   = localDayStartMs - 1;
      return {
        rangeStart: new Date(yesterdayStartMs).toISOString(),
        rangeEnd:   new Date(yesterdayEndMs).toISOString(),
      };
    }

    // week — last 7 local days
    const weekStartMs = Date.UTC(
      localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate() - 7,
      0, 0, 0, 0,
    ) + offsetMs;
    return { rangeStart: new Date(weekStartMs).toISOString(), rangeEnd: now.toISOString() };
  }

  // ---------------------------------------------------------------------------
  // getMealsTool
  // ---------------------------------------------------------------------------
  const getMealsTool = tool({
    description:
      "Fetch the authenticated user's meal history for a given time period. " +
      'Call this to answer questions about what the user has eaten (today, yesterday, this week). ' +
      'For recommendations or compliance checks, use get_daily_summary instead — it returns structured data without re-parsing text. ' +
      'Never describe meals the user did not log.',
    inputSchema: z.object({
      period: z
        .enum(['today', 'yesterday', 'week'])
        .optional()
        .default('today')
        .describe('Time window to query. Defaults to today.'),
    }),
    execute: async ({ period }) => {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return { meals: [], count: 0, error: 'Unauthorized' };

      const { rangeStart, rangeEnd } = getDateRange(period);

      const { data, error } = await supabase
        .from('meal_logs')
        .select('id, log_text, meal_type, eaten_at')
        .eq('user_id', user.id)
        .gte('eaten_at', rangeStart)
        .lte('eaten_at', rangeEnd)
        .order('eaten_at', { ascending: false });

      if (error) return { meals: [], count: 0, error: error.message };
      return { meals: data ?? [], count: (data ?? []).length };
    },
  });

  // ---------------------------------------------------------------------------
  // logMealTool
  // ---------------------------------------------------------------------------
  const logMealTool = tool({
    description:
      'Record a meal the user just described to their meal history. ' +
      'Infer the meal_type (breakfast, lunch, dinner, snack) from conversation context or time of day. ' +
      'Always infer nutrition and inferred_ingredients from the description — use the serving_sizes from the diet profile in the system prompt as portion defaults. ' +
      'After calling this tool, check the returned recipe_suggestion: if present, show the recipe preview to the user and ask whether to link it. ' +
      'If no recipe_suggestion and ≥2 ingredients were inferred, show the inferred_ingredients list and offer to save it as a recipe. ' +
      'Always show the inferred servings to the user so they can correct them.',
    inputSchema: z.object({
      log_text: z.string().min(1).max(500)
        .describe('Free-text description of the meal as described by the user.'),
      meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack'])
        .describe('Type of meal inferred from context.'),
      eaten_at: z.string().optional()
        .describe('ISO 8601 timestamp of when the meal was eaten. Defaults to now.'),
      nutrition: NutritionSchema,
      inferred_ingredients: z.array(z.string()).optional()
        .describe(
          'Ingredient strings inferred from the description. Include quantity and unit when stated ' +
          '(e.g. "1 arepa (60g harina de maíz)", "40g queso feta"). ' +
          'Populate even when a recipe_suggestion might exist — it is cleared automatically if the user links a recipe.',
        ),
      is_shared: z.boolean().optional().default(false)
        .describe(
          'True when multiple household members ate this meal together. ' +
          'Set when the user uses first-person plural cues: "comimos", "cenamos", "todos", "en casa juntos".',
        ),
      household_id: z.uuid().optional()
        .describe('Household UUID from system context. Set only when is_shared=true.'),
      co_eater_ids: z.array(z.uuid()).optional()
        .describe('User IDs of household members who also ate this meal (excludes the logger). From system context.'),
    }),
    execute: async ({ log_text, meal_type, eaten_at, nutrition, inferred_ingredients, is_shared, household_id, co_eater_ids }) => {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return { success: false, error: 'Unauthorized' };

      const shared = is_shared ?? false;

      // Insert the meal log
      const { data, error } = await supabase
        .from('meal_logs')
        .insert({
          user_id: user.id,
          log_text,
          meal_type,
          eaten_at: eaten_at ?? new Date().toISOString(),
          nutrition: { ...nutrition, servings: nutrition.servings ?? {} },
          inferred_ingredients: inferred_ingredients ?? null,
          is_shared: shared,
          household_id: shared ? (household_id ?? null) : null,
        })
        .select('id')
        .single();

      if (error) return { success: false, error: error.message };

      // Insert co-eater participant rows for shared meals
      const participants: string[] = [];
      if (shared && co_eater_ids && co_eater_ids.length > 0) {
        const rows = co_eater_ids.map((uid) => ({ meal_log_id: data.id, user_id: uid }));
        const { error: pError } = await supabase.from('meal_participants').insert(rows);
        if (!pError) participants.push(...co_eater_ids);
      }

      // Search for an existing recipe by name similarity (ilike on most distinctive word)
      const keyword = log_text.split(/\s+/).find(w => w.length > 4) ?? log_text.split(/\s+/)[0];
      const { data: match } = await supabase
        .from('recipes')
        .select('id, name, ingredients')
        .eq('user_id', user.id)
        .ilike('name', `%${keyword}%`)
        .limit(1)
        .maybeSingle();

      revalidatePath('/dashboard');
      return {
        success: true,
        meal_id: data.id,
        meal_type,
        nutrition,
        is_shared: shared,
        participants,
        recipe_suggestion: match ?? null,
      };
    },
  });

  // ---------------------------------------------------------------------------
  // saveRecipeTool
  // ---------------------------------------------------------------------------
  const saveRecipeTool = tool({
    description:
      'Infer and save a recipe from a meal the user described. ' +
      "Call this tool after log_meal when the user confirms they want to save the recipe — " +
      "always show the inferred_ingredients list to the user as a preview before calling this tool. " +
      "Pass meal_id to link the recipe to the meal that was just logged (clears inferred_ingredients). " +
      'Do NOT call this tool for meals with fewer than 2 inferable ingredients (e.g. "a coffee"). ' +
      'Ingredient strings should include quantity and unit when mentioned (e.g. "60g harina de maíz", "1 huevo mediano").',
    inputSchema: z.object({
      name: z.string().min(1).max(200)
        .describe('Dish name as the user described it.'),
      description: z.string()
        .describe("Short description reflecting the user's version of the dish."),
      ingredients: z.array(z.string()).min(2)
        .describe('List of ingredient strings. Include quantities/units when known.'),
      instructions: z.array(z.string()).default([])
        .describe('Preparation steps if inferable. Empty array is acceptable.'),
      language: z.enum(['es', 'en']).default('es')
        .describe('Language of the recipe content. Match the language the user wrote in.'),
      meal_id: z.uuid().optional()
        .describe(
          'UUID of the meal_log to link this recipe to. ' +
          'When provided, recipe_ids on that meal is updated and inferred_ingredients is cleared.',
        ),
    }),
    execute: async ({ name, description, ingredients, instructions, language, meal_id }) => {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return { success: false, error: 'Unauthorized' };

      // Save the recipe
      const { data: recipe, error: recipeError } = await supabase
        .from('recipes')
        .insert({ user_id: user.id, name, description, ingredients, instructions, language })
        .select('id')
        .single();

      if (recipeError) return { success: false, error: recipeError.message };

      // If meal_id provided, link the recipe and clear inferred_ingredients
      if (meal_id) {
        const { data: meal, error: fetchError } = await supabase
          .from('meal_logs')
          .select('recipe_ids, nutrition')
          .match({ id: meal_id, user_id: user.id })
          .single();

        if (!fetchError && meal) {
          const updatedRecipeIds = [...(meal.recipe_ids ?? []), recipe.id];
          const updatedNutrition = meal.nutrition
            ? { ...meal.nutrition, portion_confidence: 'from_recipe' }
            : null;

          await supabase
            .from('meal_logs')
            .update({
              recipe_ids: updatedRecipeIds,
              inferred_ingredients: null,
              ...(updatedNutrition ? { nutrition: updatedNutrition } : {}),
            })
            .match({ id: meal_id, user_id: user.id });
        }
      }

      revalidatePath('/dashboard');
      return {
        success: true,
        recipe_id: recipe.id,
        name,
        ingredient_count: ingredients.length,
        linked_to_meal: meal_id ?? null,
      };
    },
  });

  // ---------------------------------------------------------------------------
  // deleteMealTool
  // ---------------------------------------------------------------------------
  const deleteMealTool = tool({
    description:
      'Delete a specific meal log entry by ID. ' +
      'IMPORTANT: only call this tool AFTER you have shown the user the exact meal entry ' +
      'you intend to delete (log_text + time) and received their explicit confirmation. ' +
      'Never guess the meal_id — always retrieve it via get_meals first.',
    inputSchema: z.object({
      meal_id: z.uuid()
        .describe('UUID of the meal_log entry to delete. Must be obtained from get_meals.'),
    }),
    execute: async ({ meal_id }) => {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return { success: false, error: 'Unauthorized' };

      const { error } = await supabase
        .from('meal_logs')
        .delete()
        .match({ id: meal_id, user_id: user.id });

      if (error) return { success: false, error: error.message };

      revalidatePath('/dashboard');
      return { success: true };
    },
  });

  // ---------------------------------------------------------------------------
  // updateMealTool
  // ---------------------------------------------------------------------------
  const updateMealTool = tool({
    description:
      'Update a specific meal log entry by ID. ' +
      'Use recipe_id to link an existing recipe after the user confirms a recipe_suggestion preview. ' +
      'Use nutrition_patch to correct inferred portion servings when the user says the amounts are wrong. ' +
      'For text/type edits: show the user current values and proposed change, get explicit confirmation first. ' +
      'Never guess the meal_id — always retrieve it via get_meals first. ' +
      'At least one field must be provided.',
    inputSchema: z.object({
      meal_id: z.uuid()
        .describe('UUID of the meal_log entry to update. Must be obtained from get_meals or log_meal.'),
      log_text: z.string().min(1).max(500).optional()
        .describe('New description for the meal. Omit to keep unchanged.'),
      meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional()
        .describe('New meal type. Omit to keep unchanged.'),
      recipe_id: z.uuid().optional()
        .describe('Existing recipe UUID to link to this meal. Appended to recipe_ids.'),
      nutrition_patch: z.object({
        servings: z.record(ServingCategoryEnum, z.number().int().min(0)).optional()
          .describe('Partial servings update. Merges with existing; value 0 removes that category (sparse).'),
      }).optional()
        .describe("Partial update to nutrition when user corrects inferred portions. Sets portion_confidence to 'stated'."),
    }).refine(
      (d) =>
        d.log_text !== undefined ||
        d.meal_type !== undefined ||
        d.recipe_id !== undefined ||
        d.nutrition_patch !== undefined,
      { message: 'At least one of log_text, meal_type, recipe_id, or nutrition_patch must be provided.' },
    ),
    execute: async ({ meal_id, log_text, meal_type, recipe_id, nutrition_patch }) => {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return { success: false, error: 'Unauthorized' };

      // Build the update payload
      const updates: Record<string, unknown> = {};
      if (log_text  !== undefined) updates.log_text  = log_text;
      if (meal_type !== undefined) updates.meal_type = meal_type;

      // Recipe linking: fetch existing recipe_ids, append
      if (recipe_id !== undefined) {
        const { data: meal } = await supabase
          .from('meal_logs')
          .select('recipe_ids, nutrition')
          .match({ id: meal_id, user_id: user.id })
          .single();

        if (meal) {
          const existing = meal.recipe_ids ?? [];
          if (!existing.includes(recipe_id)) {
            updates.recipe_ids = [...existing, recipe_id];
            updates.inferred_ingredients = null;
            if (meal.nutrition) {
              updates.nutrition = { ...meal.nutrition, portion_confidence: 'from_recipe' };
            }
          }
        }
      }

      // Nutrition patch: merge sparse servings, set portion_confidence to 'stated'
      if (nutrition_patch !== undefined) {
        const { data: meal } = await supabase
          .from('meal_logs')
          .select('nutrition')
          .match({ id: meal_id, user_id: user.id })
          .single();

        if (meal?.nutrition) {
          const existing = meal.nutrition as Record<string, unknown>;
          const existingServings = (existing.servings ?? {}) as Record<string, number>;
          const patchServings    = nutrition_patch.servings ?? {};

          // Merge: apply patch values; remove any set to 0 (keep sparse)
          const mergedServings: Record<string, number> = { ...existingServings };
          for (const [cat, val] of Object.entries(patchServings)) {
            if (val === 0) {
              delete mergedServings[cat];
            } else {
              mergedServings[cat] = val as number;
            }
          }

          updates.nutrition = {
            ...existing,
            servings: mergedServings,
            portion_confidence: 'stated',
          };
        }
      }

      if (Object.keys(updates).length === 0) {
        return { success: false, error: 'Meal not found or no fields to update.' };
      }

      const { error } = await supabase
        .from('meal_logs')
        .update(updates)
        .match({ id: meal_id, user_id: user.id });

      if (error) return { success: false, error: error.message };

      revalidatePath('/dashboard');
      return { success: true, meal_id, updated: Object.keys(updates) };
    },
  });

  // ---------------------------------------------------------------------------
  // getDailySummaryTool
  // ---------------------------------------------------------------------------
  const getDailySummaryTool = tool({
    description:
      "Fetch a structured nutrition summary for the user's meals vs. their diet targets. " +
      'Use this for recommendations ("what should I eat next?") and compliance checks ("how am I doing today?"). ' +
      'Do NOT use get_meals for these — use this tool instead. ' +
      'The returned daily/weekly objects show consumed vs. target per category so you can identify gaps directly from numbers. ' +
      'For "what did I eat?" queries that need human-readable descriptions, use get_meals.',
    inputSchema: z.object({
      period: z.enum(['today', 'week']).default('today')
        .describe('today = current local day only; week = last 7 days including today.'),
      scope: z.enum(['individual', 'household', 'combined']).optional().default('combined')
        .describe(
          '"individual" = only the caller\'s own meals; ' +
          '"household" = shared household meals only; ' +
          '"combined" (default) = individual + household shared meals. ' +
          'For users with no household, always falls back to individual regardless of scope.',
        ),
    }),
    execute: async ({ period, scope }) => {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return { error: 'Unauthorized' };

      const todayRange = getDateRange('today');

      // Resolve the user's household (needed for household/combined scopes)
      const { data: membership } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      const householdId = membership?.household_id ?? null;

      // Pre-fetch dismissed shared meal IDs so household/combined queries exclude them.
      // RLS already enforces this exclusion, but we filter explicitly for defence-in-depth.
      let dismissedMealIds: string[] = [];
      if (householdId && scope !== 'individual') {
        const { data: dismissed } = await supabase
          .from('meal_participants')
          .select('meal_log_id')
          .eq('user_id', user.id)
          .eq('dismissed', true);
        dismissedMealIds = (dismissed ?? []).map((d) => d.meal_log_id as string);
      }

      const fetchMeals = async (rangeStart: string, rangeEnd: string) => {
        let query = supabase
          .from('meal_logs')
          .select('meal_type, nutrition, eaten_at')
          .gte('eaten_at', rangeStart)
          .lte('eaten_at', rangeEnd)
          .order('eaten_at', { ascending: true });

        if (!householdId || scope === 'individual') {
          query = query.eq('user_id', user.id);
        } else if (scope === 'household') {
          query = query.eq('is_shared', true).eq('household_id', householdId);
        } else {
          // combined: own meals OR shared meals from household
          query = query.or(`user_id.eq.${user.id},and(is_shared.eq.true,household_id.eq.${householdId})`);
        }

        // Exclude meals the user has dismissed
        if (dismissedMealIds.length > 0) {
          query = query.not('id', 'in', `(${dismissedMealIds.join(',')})`);
        }

        const { data } = await query;
        return data ?? [];
      };

      // Fetch profile and meals in parallel.
      // When period='week', fetch the full 7-day window; today's meals are derived
      // by JS filtering to avoid a second DB call.
      const weekRange = period === 'week' ? getDateRange('week') : null;
      const [{ data: profileRow }, fetchedMeals] = await Promise.all([
        supabase
          .from('user_diet_profiles')
          .select('daily_targets, weekly_targets, restrictions')
          .eq('user_id', user.id)
          .single(),
        weekRange
          ? fetchMeals(weekRange.rangeStart, weekRange.rangeEnd)
          : fetchMeals(todayRange.rangeStart, todayRange.rangeEnd),
      ]);

      const weekMeals  = fetchedMeals;
      const todayMeals = weekRange
        ? fetchedMeals.filter(m => (m.eaten_at as string) >= todayRange.rangeStart)
        : fetchedMeals;

      const dailyTargets  = (profileRow?.daily_targets  ?? {}) as Record<string, { min?: number; max?: number }>;
      const weeklyTargets = (profileRow?.weekly_targets ?? {}) as Record<string, { min?: number; max?: number }>;
      const restrictions  = (profileRow?.restrictions   ?? {
        no_repeat_hours: 48,
        occasional_foods: [],
        protein_rotation: [],
      }) as { no_repeat_hours: number; occasional_foods: string[]; protein_rotation: string[] };

      // Aggregate sparse servings across a set of meals
      const aggregateServings = (meals: typeof todayMeals) => {
        const totals: Record<string, number> = {};
        for (const meal of meals) {
          const servings = (meal.nutrition as Record<string, unknown> | null)?.servings as
            Record<string, number> | undefined;
          if (!servings) continue;
          for (const [cat, count] of Object.entries(servings)) {
            totals[cat] = (totals[cat] ?? 0) + (count as number);
          }
        }
        return totals;
      };

      const todayServings = aggregateServings(todayMeals);
      const weekServings  = aggregateServings(weekMeals);

      // Build consumed-vs-target objects (only categories that have a target OR were consumed)
      const buildComparison = (
        servings: Record<string, number>,
        targets: Record<string, { min?: number; max?: number }>,
      ) => {
        const allKeys = new Set([...Object.keys(servings), ...Object.keys(targets)]);
        const result: Record<string, { consumed: number; min?: number; max?: number }> = {};
        for (const key of allKeys) {
          result[key] = {
            consumed: servings[key] ?? 0,
            ...(targets[key]?.min !== undefined ? { min: targets[key].min } : {}),
            ...(targets[key]?.max !== undefined ? { max: targets[key].max } : {}),
          };
        }
        return result;
      };

      // Per-meal food groups and protein types
      const mealsSummary = todayMeals.map(m => {
        const n = m.nutrition as Record<string, unknown> | null;
        return {
          meal_type:    m.meal_type as string,
          food_groups:  (n?.food_groups as string[] | undefined) ?? [],
          protein_type: (n?.protein_type as string | null | undefined) ?? null,
        };
      });

      const proteinTypesThisWeek = [
        ...new Set(
          weekMeals
            .map(m => (m.nutrition as Record<string, unknown> | null)?.protein_type as string | null)
            .filter((p): p is string => Boolean(p)),
        ),
      ];

      return {
        period,
        meals_logged: todayMeals.length,
        daily: buildComparison(todayServings, dailyTargets),
        weekly: period === 'week'
          ? buildComparison(weekServings, weeklyTargets)
          : undefined,
        meals: mealsSummary,
        protein_types_this_week: proteinTypesThisWeek,
        restrictions,
      };
    },
  });

  return {
    getMealsTool,
    logMealTool,
    saveRecipeTool,
    deleteMealTool,
    updateMealTool,
    getDailySummaryTool,
  };
}
