import { tool } from 'ai';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// getMealsTool
// Fetches the authenticated user's meal history for a given time period.
// Used by: history queries, recommendations, and delete flows.
// ---------------------------------------------------------------------------
export const getMealsTool = tool({
  description:
    "Fetch the authenticated user's meal history for a given time period. " +
    'Call this tool before making any food recommendation — use the returned meal history ' +
    'to understand what the user has already eaten and ensure suggestions complement their ' +
    'day nutritionally according to the three food groups (vitamins, proteins, carbohydrates). ' +
    'Also call this to answer questions about what the user has eaten (today, yesterday, this week). ' +
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { meals: [], count: 0, error: 'Unauthorized' };
    }

    const now = new Date();
    let rangeStart: string;
    let rangeEnd: string;

    if (period === 'today') {
      const start = new Date(now);
      start.setUTCHours(0, 0, 0, 0);
      rangeStart = start.toISOString();
      rangeEnd = now.toISOString();
    } else if (period === 'yesterday') {
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() - 1);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setUTCHours(23, 59, 59, 999);
      rangeStart = start.toISOString();
      rangeEnd = end.toISOString();
    } else {
      // week — last 7 days
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() - 7);
      start.setUTCHours(0, 0, 0, 0);
      rangeStart = start.toISOString();
      rangeEnd = now.toISOString();
    }

    const { data, error } = await supabase
      .from('meal_logs')
      .select('id, log_text, meal_type, eaten_at')
      .eq('user_id', user.id)
      .gte('eaten_at', rangeStart)
      .lte('eaten_at', rangeEnd)
      .order('eaten_at', { ascending: false });

    if (error) {
      return { meals: [], count: 0, error: error.message };
    }

    return { meals: data ?? [], count: (data ?? []).length };
  },
});

// ---------------------------------------------------------------------------
// logMealTool
// Records a meal the user described in natural language to their meal history.
// ---------------------------------------------------------------------------
export const logMealTool = tool({
  description:
    'Record a meal the user just described to their meal history. ' +
    'Infer the meal_type (breakfast, lunch, dinner, snack) from the conversation context or time of day. ' +
    'Always confirm what you understood before calling this tool, then save it.',
  inputSchema: z.object({
    log_text: z
      .string()
      .min(1)
      .max(500)
      .describe('Free-text description of the meal as described by the user.'),
    meal_type: z
      .enum(['breakfast', 'lunch', 'dinner', 'snack'])
      .describe('Type of meal inferred from context.'),
    eaten_at: z
      .string()
      .optional()
      .describe('ISO 8601 timestamp of when the meal was eaten. Defaults to now.'),
  }),
  execute: async ({ log_text, meal_type, eaten_at }) => {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: 'Unauthorized' };
    }

    const { data, error } = await supabase
      .from('meal_logs')
      .insert({
        user_id: user.id,
        log_text,
        meal_type,
        eaten_at: eaten_at ?? new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/dashboard');
    return { success: true, meal_id: data.id, log_text, meal_type };
  },
});

// ---------------------------------------------------------------------------
// saveRecipeTool
// Infers and persists a recipe from a meal description.
// Only call when ≥2 ingredients can be reasonably inferred.
// Failures are silent — the meal log already succeeded.
// ---------------------------------------------------------------------------
export const saveRecipeTool = tool({
  description:
    'Infer and save a recipe from a meal the user described. ' +
    "Call this tool after log_meal when you can reasonably infer at least 2 ingredients " +
    "from the dish name or the user's description. " +
    "Save the user's version of the recipe — including any substitutions they mentioned " +
    '(e.g., yogurt instead of mayo). Do NOT call this tool for meals with fewer than 2 inferable ingredients ' +
    '(e.g., "a coffee"). Ingredient strings should include quantity and unit when mentioned ' +
    '(e.g., "60g harina de maíz cruda", "aguacate", "yogur natural").',
  inputSchema: z.object({
    name: z
      .string()
      .min(1)
      .max(200)
      .describe('Dish name as the user described it (e.g., "Reina Pepiada", "Avena con plátano").'),
    description: z
      .string()
      .describe("Short description of the dish reflecting the user's version."),
    ingredients: z
      .array(z.string())
      .min(2)
      .describe('List of ingredient strings. Include quantities/units when known.'),
    instructions: z
      .array(z.string())
      .default([])
      .describe('Preparation steps if inferable. Empty array is acceptable.'),
    language: z
      .enum(['es', 'en'])
      .default('es')
      .describe('Language of the recipe content. Match the language the user wrote in.'),
  }),
  execute: async ({ name, description, ingredients, instructions, language }) => {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: 'Unauthorized' };
    }

    const { data, error } = await supabase
      .from('recipes')
      .insert({
        user_id: user.id,
        name,
        description,
        ingredients,
        instructions,
        language,
      })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      recipe_id: data.id,
      name,
      ingredient_count: ingredients.length,
    };
  },
});

// ---------------------------------------------------------------------------
// deleteMealTool
// Deletes a specific meal log entry by ID after user confirmation.
// IMPORTANT: always call getMealsTool first, present the entry to the user,
// and only call this after explicit confirmation.
// ---------------------------------------------------------------------------
export const deleteMealTool = tool({
  description:
    'Delete a specific meal log entry by ID. ' +
    'IMPORTANT: only call this tool AFTER you have shown the user the exact meal entry ' +
    'you intend to delete (log_text + time) and received their explicit confirmation. ' +
    'Never guess the meal_id — always retrieve it via get_meals first.',
  inputSchema: z.object({
    meal_id: z
      .string()
      .uuid()
      .describe('UUID of the meal_log entry to delete. Must be obtained from get_meals.'),
  }),
  execute: async ({ meal_id }) => {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: 'Unauthorized' };
    }

    const { error } = await supabase
      .from('meal_logs')
      .delete()
      .match({ id: meal_id, user_id: user.id });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/dashboard');
    return { success: true };
  },
});
