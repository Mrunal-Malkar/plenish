import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { getAIModel, getSystemPrompt } from '@/lib/ai/provider';
import { createClient } from '@/lib/supabase/server';
import {
  getMealsTool,
  logMealTool,
  saveRecipeTool,
  deleteMealTool,
} from '@/lib/ai/tools/meal-tools';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return new Response('Unauthorized', { status: 401 });

  const { messages } = await req.json();

  const model = getAIModel();

  const result = streamText({
    model,
    system: getSystemPrompt(),
    messages: await convertToModelMessages(messages),
    tools: {
      get_meals: getMealsTool,
      log_meal: logMealTool,
      save_recipe: saveRecipeTool,
      delete_meal: deleteMealTool,
    },
    stopWhen: stepCountIs(7),
  });

  return result.toUIMessageStreamResponse();
}
