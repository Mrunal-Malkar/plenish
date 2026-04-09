'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type ServingCategory =
  | 'dairy' | 'grains' | 'fruit' | 'vegetables'
  | 'fish'  | 'meat'   | 'eggs'  | 'nuts' | 'legumes';

export interface MealNutrition {
  food_groups: ('vitaminas' | 'proteinas' | 'hidratos')[];
  protein_type:
    | 'white_meat' | 'red_meat' | 'fish_blue' | 'fish_white'
    | 'eggs' | 'legumes'
    | null;
  /** Sparse — only categories with count >= 1 are present. */
  servings: Partial<Record<ServingCategory, number>>;
  has_occasional_food: boolean;
  portion_confidence: 'from_recipe' | 'stated' | 'estimated';
}

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
  eaten_at: string;
  created_at: string;
}

export async function logMeal(logText: string, mealType: MealType) {
  const supabase = await createClient();
  
  // Verify auth securely
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Unauthorized');
  }

  // Insert log
  const { data, error } = await supabase
    .from('meal_logs')
    .insert({
      user_id: user.id,
      log_text: logText,
      meal_type: mealType,
      eaten_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error logging meal:', error);
    throw new Error('Failed to log meal');
  }

  // Clear cache for dashboard so the new meal shows up
  revalidatePath('/dashboard');
  
  return { success: true, meal: data };
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
