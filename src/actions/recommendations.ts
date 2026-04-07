'use server';

import { createClient } from '@/lib/supabase/server';
import { getRecentMeals } from './meals';
import { generateAIRecommendation, type Recommendation } from '@/lib/ai/getRecommendation';

export async function getAIRecommendation(): Promise<Recommendation | null> {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const recentMeals = await getRecentMeals();

  try {
    return await generateAIRecommendation(recentMeals);
  } catch (err) {
    console.error('Failed to generate recommendation:', err);
    return null;
  }
}
