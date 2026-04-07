import { createClient } from '@/lib/supabase/server';
import { generateAIRecommendation } from '@/lib/ai/getRecommendation';
import type { MealLog } from '@/actions/meals';

export const runtime = 'nodejs';

export type { Recommendation } from '@/lib/ai/getRecommendation';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return new Response('Unauthorized', { status: 401 });

  const { recentMeals } = await req.json() as { recentMeals: MealLog[] };

  const object = await generateAIRecommendation(recentMeals);

  return Response.json(object);
}
