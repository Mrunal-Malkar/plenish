import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { getAIModel, SYSTEM_PROMPT } from '@/lib/ai/provider';
import {
  getMealsTool,
  logMealTool,
  saveRecipeTool,
  deleteMealTool,
} from '@/lib/ai/tools/meal-tools';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const model = getAIModel();

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
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
