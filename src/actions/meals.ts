'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { MealNutrition } from '@/lib/ai/nutrition-schemas';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealLog {
  id: string;
  user_id: string;
  log_text: string;
  meal_type: MealType;
  recipe_ids: string[];
  /** Structured nutrition data. Null for meals logged before this feature. */
  nutrition: MealNutrition | null;
  /** Temporary ingredient strings for unlinked meals. Cleared when a recipe is linked. */
  inferred_ingredients: string[] | null;
  /** True when this meal was logged as shared with household members. */
  is_shared: boolean;
  /** The household this shared meal belongs to. Null for individual meals. */
  household_id: string | null;
  eaten_at: string;
  created_at: string;
}

export interface SharedMealOptions {
  isShared?: boolean;
  coEaterIds?: string[];
  householdId?: string;
}

export async function logMeal(
  logText: string,
  mealType: MealType,
  options?: SharedMealOptions,
) {
  const supabase = await createClient();

  // Verify auth securely
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  const isShared = options?.isShared ?? false;

  // Insert log
  const { data, error } = await supabase
    .from('meal_logs')
    .insert({
      user_id: user.id,
      log_text: logText,
      meal_type: mealType,
      is_shared: isShared,
      household_id: isShared ? (options?.householdId ?? null) : null,
      eaten_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error logging meal:', error);
    throw new Error('Failed to log meal');
  }

  // Insert co-eater participant rows for shared meals
  const participants: string[] = [];
  if (isShared && options?.coEaterIds && options.coEaterIds.length > 0) {
    const participantRows = options.coEaterIds.map((uid) => ({
      meal_log_id: data.id,
      user_id: uid,
    }));
    const { error: pError } = await supabase.from('meal_participants').insert(participantRows);
    if (pError) {
      console.error('Error inserting meal participants:', pError);
      // Non-fatal: meal is logged; participants can be added via update_meal
    } else {
      participants.push(...options.coEaterIds);
    }
  }

  // Clear cache for dashboard so the new meal shows up
  revalidatePath('/dashboard');

  return { success: true, meal: data, participants };
}

export async function getRecentMeals(): Promise<MealLog[]> {
  const supabase = await createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return [];

  const { data, error } = await supabase
    .from('meal_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('eaten_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching meals:', error);
    return [];
  }

  return data as MealLog[];
}

export async function deleteMeal(id: string) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Delete safely (RLS also protects this, but we filter by user.id as an extra safety measure)
  const { error } = await supabase
    .from('meal_logs')
    .delete()
    .match({ id, user_id: user.id });

  if (error) {
    console.error('Error deleting meal:', error);
    throw new Error('Failed to delete meal');
  }

  revalidatePath('/dashboard');
  return { success: true };
}

export async function dismissSharedMeal(mealLogId: string) {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  // Verify the meal exists and the caller is a co-eater (not the original logger)
  const { data: meal } = await supabase
    .from('meal_logs')
    .select('user_id')
    .eq('id', mealLogId)
    .maybeSingle();

  if (!meal) {
    throw new Error('Meal not found.');
  }

  if (meal.user_id === user.id) {
    throw new Error('Use deleteMeal to remove a meal you logged yourself.');
  }

  const { error } = await supabase
    .from('meal_participants')
    .update({ dismissed: true })
    .eq('meal_log_id', mealLogId)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error dismissing shared meal:', error);
    throw new Error('Failed to dismiss meal.');
  }

  revalidatePath('/dashboard');
  return { success: true };
}
