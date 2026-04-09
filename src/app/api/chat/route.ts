import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { getAIModel, getSystemPrompt } from '@/lib/ai/provider';
import { createClient } from '@/lib/supabase/server';
import { createMealTools } from '@/lib/ai/tools/meal-tools';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return new Response('Unauthorized', { status: 401 });

  const { messages, tzOffset } = await req.json();
  const tz = Number.isFinite(tzOffset) ? tzOffset : 0;

  const model = getAIModel();
  const system = await getSystemPrompt(tz, user.id, supabase);

  const {
    getMealsTool,
    logMealTool,
    saveRecipeTool,
    deleteMealTool,
    updateMealTool,
    getDailySummaryTool,
  } = createMealTools(tz);

  const result = streamText({
    model,
    system,
    messages: await convertToModelMessages(messages),
    tools: {
      get_meals:          getMealsTool,
      log_meal:           logMealTool,
      save_recipe:        saveRecipeTool,
      delete_meal:        deleteMealTool,
      update_meal:        updateMealTool,
      get_daily_summary:  getDailySummaryTool,
    },
    stopWhen: stepCountIs(7),
  });

  return result.toUIMessageStreamResponse();
}
