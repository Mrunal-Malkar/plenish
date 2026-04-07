'use server';

import { createClient } from '@/lib/supabase/server';
import { getRecentMeals } from './meals';
import type { Recommendation } from '@/app/api/recommendations/route';

export async function getAIRecommendation(): Promise<Recommendation | null> {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const recentMeals = await getRecentMeals();

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

    const res = await fetch(`${baseUrl}/api/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recentMeals }),
    });

    if (!res.ok) return null;

    return res.json() as Promise<Recommendation>;
  } catch (err) {
    console.error('Failed to fetch recommendation:', err);
    return null;
  }
}
