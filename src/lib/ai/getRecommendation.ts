import { generateObject } from 'ai';
import { z } from 'zod';
import { getAIModel } from '@/lib/ai/provider';
import type { MealLog } from '@/actions/meals';

export const RecommendationSchema = z.object({
  name: z.string().describe('Name of the recommended dish, in Spanish if culturally appropriate'),
  description: z.string().describe('1-2 sentence description of the dish'),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  prepTimeMinutes: z.number().int().positive(),
  estimatedCalories: z.number().int().positive(),
  reason: z.string().describe('Why this meal is being recommended based on the user history'),
  ingredients: z.array(z.string()).max(8).describe('Main ingredients list'),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

function buildPrompt(recentMeals: MealLog[]): string {
  if (recentMeals.length === 0) {
    return 'The user has no meal history yet. Recommend a classic, balanced Spanish or Latin dish for lunch.';
  }

  const summary = recentMeals
    .map(m => `- ${m.meal_type}: ${m.log_text}`)
    .join('\n');

  return `Based on the user's recent meals, recommend a single meal for their next eating occasion.

Recent meal history:
${summary}

Consider variety, nutritional balance, and cultural preference for Spanish/Latin cuisine.
Avoid recommending something they just had. Keep it practical and appetizing.`;
}

export async function generateAIRecommendation(recentMeals: MealLog[]): Promise<Recommendation> {
  const model = getAIModel();

  const { object } = await generateObject({
    model,
    schema: RecommendationSchema,
    prompt: buildPrompt(recentMeals),
  });

  return object;
}
