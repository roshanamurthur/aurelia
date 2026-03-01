// server/orchestrationAgent.ts
//
// THIS FILE IS A GENERIC LOOP. IT CONTAINS NO BUSINESS LOGIC.
// It routes messages between the OpenAI API and the tool handlers.

import OpenAI from "openai";
import { toolDefinitions } from "./toolDefinitions";
import { createToolHandlers } from "./toolHandlers";
import {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";

const openai = new OpenAI({
  apiKey: process.env.AURELIA_LLM_API_KEY,
});

const SYSTEM_PROMPT = `You are the Orchestration Agent for Aurelia, a meal planning application.

You manage two data layers:
- PREFERENCE LAYER: Durable user settings (dietary restrictions, allergies, cuisine preferences, nutritional targets, budget, household size). Updated when the user expresses a lasting change.
- PLAN LAYER: The concrete weekly meal plan with specific recipes in specific day/meal slots. Updated when assigning, swapping, or removing meals.

RULES:
1. When a user requests a change, determine if it is a persistent preference update or a one-time plan edit.
2. For preference updates: call update_preferences first, then re-evaluate affected meals in the current plan. Skip meals where isManualOverride is true.
3. For one-time plan edits: modify the plan directly. Do NOT update preferences.
4. Always search for recipes (search_recipes) before assigning a meal. Never write a meal to the plan without a valid recipe from Spoonacular.
5. When populating a full weekly plan, get preferences first, then search and assign meals for each slot.
6. Before initiating any order (DoorDash, Instacart, OpenTable), confirm the details with the user.
7. After modifying the plan, offer to regenerate the grocery list if relevant.
8. Be conversational and helpful. If the user hasn't set preferences yet, guide them through setting up their dietary preferences before generating a plan.
9. Today's date is ${new Date().toISOString().split("T")[0]}. Use the Monday of the current week as the default weekStartDate unless the user specifies otherwise.
10. After generating a complete initial meal plan with all requested meal slots filled, call intake_complete. Only call this once during first plan generation, not for ongoing modifications.
11. VARIETY IS CRITICAL. When populating a weekly meal plan:
    - Search with DIFFERENT query keywords for each meal type. E.g., "eggs" for one breakfast, "pancakes" for another, "smoothie bowl" for a third.
    - Vary cuisines across the week (Italian Monday, Japanese Tuesday, Mexican Wednesday, etc.).
    - Use the offset parameter to get different results from previous searches.
    - NEVER assign the same recipeId to more than one meal slot in a week.
    - For efficiency: search for each meal type (breakfast, lunch, dinner) 2-3 times with different queries requesting number=10 results, then pick unique recipes from the combined results.`;

export async function handleUserMessage(
  authToken: string,
  userMessage: string,
  conversationHistory: ChatCompletionMessageParam[]
): Promise<{
  reply: string;
  conversationHistory: ChatCompletionMessageParam[];
  action?: { type: "navigate"; to: string };
}> {
  const toolHandlers = createToolHandlers(authToken);

  conversationHistory.push({ role: "user", content: userMessage });

  while (true) {
    // Step 1: Send conversation + tool definitions to the LLM
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...conversationHistory,
      ],
      tools: toolDefinitions,
      tool_choice: "auto",
    });

    const message = response.choices[0].message;

    // Step 2: Add assistant response to history
    conversationHistory.push(message);

    // Step 3: Check if the LLM wants to call tools
    if (!message.tool_calls || message.tool_calls.length === 0) {
      // No tool calls — LLM responded with text, return to user
      // Scan history for intake_complete to trigger navigation
      const intakeCalled = conversationHistory.some(
        (msg) =>
          msg.role === "assistant" &&
          Array.isArray((msg as any).tool_calls) &&
          (msg as any).tool_calls.some(
            (tc: any) => tc.function?.name === "intake_complete"
          )
      );

      return {
        reply: message.content || "",
        conversationHistory,
        ...(intakeCalled && { action: { type: "navigate" as const, to: "/meal-plan" } }),
      };
    }

    // Step 4: Tool calls found — execute each one
    const toolResults: ChatCompletionToolMessageParam[] = [];

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") continue;
      const handler = toolHandlers[toolCall.function.name];

      if (!handler) {
        toolResults.push({
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` }),
        });
        continue;
      }

      try {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await handler(args);
        toolResults.push({
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      } catch (error: any) {
        toolResults.push({
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: error.message }),
        });
      }
    }

    // Step 5: Feed tool results back to LLM and loop
    conversationHistory.push(...toolResults);
    // The loop continues — the LLM sees the results and decides
    // whether to call another tool or respond with text
  }
}
