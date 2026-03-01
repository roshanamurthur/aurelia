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
4. INGREDIENT PERSISTENCE: When calling update_meal for home-cooked meals, ALWAYS include the complete ingredients array from search_recipes or get_recipe_details. If search_recipes didn't return ingredients, call get_recipe_details first. Meals without ingredients produce empty grocery lists.
5. When populating a full weekly plan, get preferences first, then search and assign meals for each slot.
6. Before initiating any order (DoorDash, Instacart, OpenTable), confirm the details with the user.
7. After modifying the plan, offer to regenerate the grocery list if relevant.
8. TAKEOUT HANDLING: When the user requests takeout or delivery for a meal slot, do NOT search Spoonacular. Instead call update_meal with isTakeout=true, a placeholder recipeId (e.g. "takeout-doordash"), takeoutService set to the service, and the meal name as recipeName. Then call the appropriate ordering tool (initiate_doordash_order, etc.). If the user doesn't specify a service, ask which one they'd like.
9. MIXED MEAL TYPES: Plans can contain a mix of home-cooked meals, takeout/delivery, restaurant reservations, and skipped slots. The grocery list automatically excludes takeout and skipped meals.
10. TYPE CONVERSION: To convert a takeout slot back to home-cooked, call update_meal with isTakeout omitted/false, a valid Spoonacular recipeId, and the full ingredients array. The takeout fields will be cleared automatically.
11. Be conversational and helpful. If the user hasn't set preferences yet, guide them through setting up their dietary preferences before generating a plan.
12. Today's date is ${new Date().toISOString().split("T")[0]}. Use the Monday of the current week as the default weekStartDate unless the user specifies otherwise.
13. After generating a complete initial meal plan with all requested meal slots filled, call intake_complete. Only call this once during first plan generation, not for ongoing modifications.
14. VARIETY IS CRITICAL. When populating a weekly meal plan:
    - Search with DIFFERENT query keywords for each meal type. E.g., "eggs" for one breakfast, "pancakes" for another, "smoothie bowl" for a third.
    - Vary cuisines across the week (Italian Monday, Japanese Tuesday, Mexican Wednesday, etc.).
    - Use the offset parameter to get different results from previous searches.
    - NEVER assign the same recipeId to more than one meal slot in a week.
    - For efficiency: search for each meal type (breakfast, lunch, dinner) 2-3 times with different queries requesting number=10 results, then pick unique recipes from the combined results.
15. LONG-TERM MEMORY. You have access to a persistent memory system that remembers the user across sessions:
    - Call store_memory whenever the user reveals a taste pattern, cooking habit, texture preference, cuisine opinion, or meal feedback. Be proactive — if they say "this salmon was amazing", store it.
    - Call recall_memories BEFORE searching for recipes. Use the context (e.g. "breakfast", "comfort food", "quick dinners") to retrieve relevant taste intelligence. Incorporate the results into your recipe search queries and selections.
    - Call get_taste_profile when generating a full weekly plan to get the holistic view of the user's food personality. Use static traits as hard constraints and dynamic traits as soft preferences.
    - Memory complements structured preferences (Convex). Preferences are explicit settings (allergies, diet, macros). Memories are nuanced observations (loves umami, prefers al dente pasta, enjoys Sunday batch cooking).
    - When memories conflict with structured preferences, preferences win (they represent explicit user choices).
    - Do NOT store information that already exists in structured preferences (allergies, dietary restrictions, macro targets). Those belong in update_preferences.`;

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
