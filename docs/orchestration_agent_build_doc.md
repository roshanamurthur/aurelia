# Orchestration Agent — Build Document

## What This Document Is

This is the complete build spec for the orchestration agent of a meal planning application. It is intended to be used as context for a coding agent to build the system. Read this entire document before writing any code.

---

## Core Concepts (Definitions)

### Orchestration Agent (`server/orchestrationAgent.ts`)

The orchestration agent is a **generic while loop** that sits between the LLM and the tool handlers. It contains zero business logic. Its only job is:

1. Send the conversation history + tool definitions to the Claude API
2. Receive the response
3. If the LLM returned text → return it to the user
4. If the LLM returned a tool call (a JSON object with a tool name and arguments) → look up the matching function in tool handlers, execute it, append the result to the conversation history, and go back to step 1

The orchestration agent does not know what a meal plan is, what Convex is, or what Spoonacular does. It is pure routing logic. If you swapped the tool definitions and handlers for a completely different domain, this file would not change.

### Tool Definitions (`server/toolDefinitions.ts`)

Tool definitions are an **array of JSON schemas** sent to the LLM with every API call. They describe what tools exist, what each tool does (in natural language), and what arguments each tool accepts. The LLM reads these descriptions to decide which tool to call and what arguments to pass.

The LLM never sees the actual handler code. It only sees these JSON schemas. The quality of the `description` fields directly determines how well the LLM uses the tools — bad descriptions lead to wrong tool calls.

Every tool definition must have a corresponding tool handler with the exact same `name`.

### Tool Handlers (`server/toolHandlers.ts`)

Tool handlers are **the functions that actually execute business logic**. Each handler is a function that receives the arguments the LLM chose (from the tool definition schema) and does the real work: calling Convex mutations/queries, hitting external APIs like Spoonacular, or triggering downstream agents like the Browser Use agent for DoorDash/Instacart/OpenTable automation.

There is a one-to-one mapping between tool definitions and tool handlers. Every `name` in tool definitions must have a matching key in tool handlers.

Tool handlers fall into three categories:
- **Convex handlers**: Read/write to the Convex database (preferences, meal plans, grocery lists, order events)
- **External API handlers**: Call third-party APIs like Spoonacular (recipe search, nutrition data)
- **Agent-triggering handlers**: Log an order event to Convex AND trigger a downstream Browser Use agent to automate a web-based task (DoorDash ordering, Instacart ordering, OpenTable reservations)

### Browser Use Agent (Downstream — NOT part of this build)

The Browser Use agent is a separate system that programmatically controls a web browser to interact with services like DoorDash, Instacart, and OpenTable. It is NOT part of the orchestration agent. The orchestration agent's tool handlers will eventually trigger the Browser Use agent, but for now, those handlers should:
1. Log the order event to Convex (so we have a record)
2. Return a placeholder response indicating the action was initiated
3. Include a clearly marked `// TODO: Trigger Browser Use agent here` comment

The Browser Use agent integration will be built separately and plugged into the tool handlers later. The tool handler function signature and the Convex order event logging should be built now so the integration point is clean.

---

## System Architecture

```
User (Frontend)
  │
  │  POST /api/chat  { visitorId, message }
  │
  ▼
API Route (app/api/chat/route.ts)
  │
  │  Passes message + visitorId to orchestration agent
  │
  ▼
Orchestration Agent (server/orchestrationAgent.ts)
  │
  │  While loop:
  │    1. Send history + toolDefinitions to Claude API
  │    2. Claude returns text OR tool_use JSON
  │    3. If text → return to user
  │    4. If tool_use → look up in toolHandlers, execute, loop
  │
  ├──► Tool Handlers (server/toolHandlers.ts)
  │      │
  │      ├── Convex handlers ──► Convex Database
  │      │     (get/update preferences, meal plans, grocery list)
  │      │
  │      ├── Spoonacular handlers ──► Spoonacular API
  │      │     (search recipes, get recipe details)
  │      │
  │      └── Ordering handlers ──► Convex (log event)
  │            │                     + Browser Use Agent (FUTURE)
  │            │
  │            ├── DoorDash (future: browser automation)
  │            ├── Instacart (future: browser automation)
  │            └── OpenTable (future: browser automation)
  │
  ▼
Response returned to frontend
  │
  │  Meanwhile, frontend has real-time Convex subscriptions
  │  that automatically update the UI when tool handlers
  │  mutate the database (e.g., meal plan updates appear instantly)
  │
  ▼
User sees updated meal plan + chat response
```

---

## Data Architecture

There are two distinct data layers in Convex. The orchestration agent interacts with both through tool handlers.

### Preference Layer
- **What it stores**: Durable user settings — dietary restrictions, allergies, cuisine preferences, excluded ingredients, calorie/macro targets, household size, budget, meal slots
- **How it's used**: Read by tool handlers to build Spoonacular API queries. Updated when the user expresses a lasting dietary change.
- **Key rule**: Preference field names are designed to map directly to Spoonacular API parameters (e.g., `dietaryRestrictions` → Spoonacular `diet` param, `allergies` → `intolerances` param)

### Plan Layer
- **What it stores**: The concrete weekly meal plan — specific recipes assigned to specific day/meal slots, with cached nutrition data and ingredient lists
- **How it's used**: Written to when the agent assigns recipes to meal slots. Read when the user asks about their plan or when generating a grocery list.
- **Key rule**: Each planned meal has an `isManualOverride` boolean. When the user explicitly chooses a specific meal, this is set to `true`. When a preference change triggers plan re-evaluation, meals with `isManualOverride: true` are skipped — they are protected from automatic changes.

### Behavioral Rule for the LLM
The orchestration agent's system prompt must include this rule:

> When a user requests a change, determine whether it is a **persistent preference update** (e.g., "I'm going vegetarian," "I don't like cilantro") or a **one-time plan edit** (e.g., "swap Thursday's dinner for something lighter"). Preference changes should propagate to the plan: update preferences first, then re-evaluate affected meals (skipping meals where `isManualOverride` is true). One-time plan edits should NOT modify preferences.

---

## File Structure

```
your-project/
├── convex/
│   ├── schema.ts              # All table definitions (see Convex Setup Guide)
│   ├── preferences.ts         # Preference layer: get, update, createDefaults
│   ├── mealPlans.ts           # Plan layer: create, getWithMeals, upsertMeal, skipMeal
│   ├── groceryList.ts         # Grocery: generate, get
│   ├── orderEvents.ts         # Order log: create, getByPlan
│   └── _generated/            # Auto-generated by Convex (do not edit)
│
├── server/
│   ├── toolDefinitions.ts     # JSON schemas sent to the LLM
│   ├── toolHandlers.ts        # Functions that execute when LLM calls a tool
│   └── orchestrationAgent.ts  # The generic while loop
│
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts       # API endpoint the frontend calls
│   ├── providers.tsx           # Convex React provider
│   └── components/
│       └── MealPlanView.tsx    # Real-time plan display (Convex subscription)
│
├── utils/
│   └── visitorId.ts            # Generates UUID for hackathon auth
│
└── .env.local
      CONVEX_URL=https://your-project.convex.cloud
      ANTHROPIC_API_KEY=sk-...
      SPOONACULAR_API_KEY=...
```

---

## Implementation

### 1. Orchestration Agent

```typescript
// server/orchestrationAgent.ts
//
// THIS FILE IS A GENERIC LOOP. IT CONTAINS NO BUSINESS LOGIC.
// It routes messages between the Claude API and the tool handlers.

import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions } from "./toolDefinitions";
import { toolHandlers } from "./toolHandlers";

const anthropic = new Anthropic(); // Uses ANTHROPIC_API_KEY from env

const SYSTEM_PROMPT = `You are the Orchestration Agent for a meal planning application.

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

The user's visitorId is injected into tool calls automatically. You do not need to ask for it.`;

export async function handleUserMessage(
  visitorId: string,
  userMessage: string,
  conversationHistory: any[]
) {
  conversationHistory.push({ role: "user", content: userMessage });

  while (true) {
    // Step 1: Send conversation + tool definitions to Claude
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: conversationHistory,
      tools: toolDefinitions,
    });

    // Step 2: Add assistant response to history
    conversationHistory.push({ role: "assistant", content: response.content });

    // Step 3: Check if the LLM wants to call tools
    const toolUseBlocks = response.content.filter(
      (block: any) => block.type === "tool_use"
    );

    // Step 4a: No tool calls — LLM responded with text, return to user
    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find(
        (block: any) => block.type === "text"
      );
      return {
        reply: textBlock?.text || "",
        conversationHistory,
      };
    }

    // Step 4b: Tool calls found — execute each one
    const toolResults: any[] = [];

    for (const toolUse of toolUseBlocks) {
      const handler = toolHandlers[toolUse.name as keyof typeof toolHandlers];

      if (!handler) {
        // Tool definition exists but no handler — this is a bug
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify({ error: `Unknown tool: ${toolUse.name}` }),
        });
        continue;
      }

      try {
        // Inject visitorId so every handler knows the user
        const argsWithUser = { ...toolUse.input, visitorId };
        const result = await handler(argsWithUser);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      } catch (error: any) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify({ error: error.message }),
        });
      }
    }

    // Step 5: Feed tool results back to LLM and loop
    conversationHistory.push({ role: "user", content: toolResults });
    // The loop continues — the LLM sees the results and decides
    // whether to call another tool or respond with text
  }
}
```

---

### 2. Tool Definitions

```typescript
// server/toolDefinitions.ts
//
// These JSON schemas are sent to the LLM with every API call.
// The LLM reads the "description" fields to decide when and how to use each tool.
// Every entry here MUST have a matching handler in toolHandlers.ts.

export const toolDefinitions = [

  // ═══════════════════════════════════════════
  // PREFERENCE LAYER TOOLS
  // ═══════════════════════════════════════════

  {
    name: "get_preferences",
    description:
      "Retrieves the user's stored dietary preferences, nutritional targets, cuisine preferences, allergies, and logistics settings. Call this before searching for recipes to ensure results match user constraints. Also call this when the user asks about their current settings.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  {
    name: "update_preferences",
    description:
      "Updates one or more of the user's persistent preference settings. Use ONLY when the user expresses a lasting dietary change (e.g., 'I'm going vegetarian', 'I'm allergic to shellfish', 'I want to target 2000 calories a day'). Do NOT use for one-time meal swaps. After calling this, re-evaluate affected meals in the active plan.",
    input_schema: {
      type: "object",
      properties: {
        dietaryRestrictions: {
          type: "array",
          items: { type: "string" },
          description: "e.g. ['vegetarian', 'keto', 'gluten-free']. Replaces the full array.",
        },
        allergies: {
          type: "array",
          items: { type: "string" },
          description: "e.g. ['peanut', 'shellfish', 'dairy']. Replaces the full array.",
        },
        cuisinePreferences: {
          type: "array",
          items: { type: "string" },
          description: "e.g. ['mediterranean', 'japanese', 'mexican']. Replaces the full array.",
        },
        excludedIngredients: {
          type: "array",
          items: { type: "string" },
          description: "Ingredients the user never wants. e.g. ['cilantro', 'olives'].",
        },
        calorieTarget: {
          type: "number",
          description: "Daily calorie target.",
        },
        proteinTargetGrams: { type: "number", description: "Daily protein target in grams." },
        carbTargetGrams: { type: "number", description: "Daily carb target in grams." },
        fatTargetGrams: { type: "number", description: "Daily fat target in grams." },
        householdSize: { type: "number", description: "Number of people eating." },
        budgetPerWeek: { type: "number", description: "Weekly grocery/meal budget in dollars." },
        mealSlots: {
          type: "array",
          items: { type: "string" },
          description: "Which meals to plan. e.g. ['breakfast', 'lunch', 'dinner'].",
        },
        preferredOrderMethod: {
          type: "string",
          description: "'delivery' (DoorDash), 'groceries' (Instacart), or 'dine-in' (OpenTable).",
        },
        deliveryAddress: { type: "string", description: "User's delivery address." },
      },
      required: [],
    },
  },

  // ═══════════════════════════════════════════
  // PLAN LAYER TOOLS
  // ═══════════════════════════════════════════

  {
    name: "create_meal_plan",
    description:
      "Creates a new empty weekly meal plan for a given week. Call this once before populating meals for a new week. If a plan already exists for that week, returns the existing plan ID.",
    input_schema: {
      type: "object",
      properties: {
        weekStartDate: {
          type: "string",
          description: "ISO date of the Monday starting the week. e.g. '2026-03-02'.",
        },
      },
      required: ["weekStartDate"],
    },
  },

  {
    name: "get_meal_plan",
    description:
      "Retrieves the full meal plan for a given week, including all planned meals with their recipes, nutrition data, and status. Call this when the user asks to see their plan or when you need to evaluate existing meals before making changes.",
    input_schema: {
      type: "object",
      properties: {
        weekStartDate: {
          type: "string",
          description: "ISO date of the Monday starting the week. e.g. '2026-03-02'.",
        },
      },
      required: ["weekStartDate"],
    },
  },

  {
    name: "update_meal",
    description:
      "Assigns or replaces a recipe in a specific day/meal slot in the plan. You MUST call search_recipes first to get a valid recipeId — never invent a recipe ID. Set isManualOverride to true if the user explicitly requested this specific meal (protects it from being changed during preference propagation).",
    input_schema: {
      type: "object",
      properties: {
        mealPlanId: { type: "string", description: "The Convex ID of the meal plan." },
        day: {
          type: "string",
          enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
          description: "Day of the week.",
        },
        mealType: {
          type: "string",
          enum: ["breakfast", "lunch", "dinner", "snack"],
          description: "Meal slot.",
        },
        recipeId: { type: "string", description: "Spoonacular recipe ID." },
        recipeName: { type: "string", description: "Display name of the recipe." },
        recipeImageUrl: { type: "string", description: "URL of recipe image." },
        calories: { type: "number", description: "Calories per serving." },
        protein: { type: "number", description: "Protein in grams per serving." },
        carbs: { type: "number", description: "Carbs in grams per serving." },
        fat: { type: "number", description: "Fat in grams per serving." },
        ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              amount: { type: "number" },
              unit: { type: "string" },
            },
            required: ["name", "amount", "unit"],
          },
          description: "Ingredient list for this recipe (used to build grocery list).",
        },
        isManualOverride: {
          type: "boolean",
          description: "Set true if the user explicitly chose this meal. Protects it from preference propagation.",
        },
      },
      required: ["mealPlanId", "day", "mealType", "recipeId", "recipeName", "isManualOverride"],
    },
  },

  {
    name: "remove_meal",
    description:
      "Marks a meal slot as skipped. Use when the user wants to remove a meal without replacing it.",
    input_schema: {
      type: "object",
      properties: {
        mealPlanId: { type: "string", description: "The Convex ID of the meal plan." },
        day: {
          type: "string",
          enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
        },
        mealType: {
          type: "string",
          enum: ["breakfast", "lunch", "dinner", "snack"],
        },
      },
      required: ["mealPlanId", "day", "mealType"],
    },
  },

  // ═══════════════════════════════════════════
  // RECIPE DISCOVERY TOOLS
  // ═══════════════════════════════════════════

  {
    name: "search_recipes",
    description:
      "Searches Spoonacular for recipes matching dietary filters. Always incorporate the user's preferences as base filters (call get_preferences first if you haven't already). Returns a list of recipes with IDs, names, images, and nutrition data.",
    input_schema: {
      type: "object",
      properties: {
        diet: { type: "string", description: "e.g. 'vegetarian', 'keto', 'paleo'." },
        intolerances: { type: "string", description: "Comma-separated. e.g. 'peanut,shellfish'." },
        cuisine: { type: "string", description: "e.g. 'mediterranean', 'japanese'." },
        excludeIngredients: { type: "string", description: "Comma-separated. e.g. 'cilantro,olives'." },
        maxCalories: { type: "number", description: "Max calories per serving." },
        query: { type: "string", description: "Optional keyword. e.g. 'salmon', 'quick breakfast'." },
      },
      required: [],
    },
  },

  {
    name: "get_recipe_details",
    description:
      "Gets full details for a specific recipe including complete ingredient list and nutrition breakdown. Use this after search_recipes if you need the full ingredient list to write to the plan.",
    input_schema: {
      type: "object",
      properties: {
        recipeId: { type: "string", description: "Spoonacular recipe ID." },
      },
      required: ["recipeId"],
    },
  },

  // ═══════════════════════════════════════════
  // GROCERY TOOLS
  // ═══════════════════════════════════════════

  {
    name: "generate_grocery_list",
    description:
      "Consolidates all ingredients from non-skipped meals in the plan into a deduplicated grocery list. Call this after populating or modifying the meal plan.",
    input_schema: {
      type: "object",
      properties: {
        mealPlanId: { type: "string", description: "The Convex ID of the meal plan." },
      },
      required: ["mealPlanId"],
    },
  },

  {
    name: "get_grocery_list",
    description:
      "Retrieves the current grocery list for a meal plan.",
    input_schema: {
      type: "object",
      properties: {
        mealPlanId: { type: "string", description: "The Convex ID of the meal plan." },
      },
      required: ["mealPlanId"],
    },
  },

  // ═══════════════════════════════════════════
  // ORDERING / EXECUTION TOOLS
  // These will eventually trigger the Browser Use agent.
  // For now they log the order event and return a placeholder.
  // ═══════════════════════════════════════════

  {
    name: "initiate_doordash_order",
    description:
      "Initiates a DoorDash delivery order for a specific planned meal. ALWAYS confirm the meal details and delivery address with the user before calling this. This triggers the Browser Use agent to automate the DoorDash ordering flow.",
    input_schema: {
      type: "object",
      properties: {
        mealPlanId: { type: "string", description: "The Convex ID of the meal plan." },
        plannedMealId: { type: "string", description: "The Convex ID of the specific planned meal." },
        recipeName: { type: "string", description: "What to search for on DoorDash." },
        deliveryAddress: { type: "string", description: "Delivery address." },
      },
      required: ["mealPlanId", "plannedMealId", "recipeName", "deliveryAddress"],
    },
  },

  {
    name: "initiate_instacart_order",
    description:
      "Initiates an Instacart grocery delivery order from the grocery list. ALWAYS confirm with the user before calling this. This triggers the Browser Use agent to automate the Instacart ordering flow.",
    input_schema: {
      type: "object",
      properties: {
        mealPlanId: { type: "string", description: "The Convex ID of the meal plan." },
        deliveryAddress: { type: "string", description: "Delivery address." },
      },
      required: ["mealPlanId", "deliveryAddress"],
    },
  },

  {
    name: "initiate_opentable_reservation",
    description:
      "Initiates an OpenTable restaurant reservation. ALWAYS confirm details with the user before calling this. This triggers the Browser Use agent to automate the OpenTable reservation flow.",
    input_schema: {
      type: "object",
      properties: {
        mealPlanId: { type: "string", description: "The Convex ID of the meal plan." },
        cuisine: { type: "string", description: "Type of cuisine for the restaurant search." },
        location: { type: "string", description: "City or area for the restaurant." },
        date: { type: "string", description: "Reservation date. ISO format." },
        time: { type: "string", description: "Reservation time. e.g. '19:00'." },
        partySize: { type: "number", description: "Number of guests." },
      },
      required: ["mealPlanId", "cuisine", "location", "date", "time", "partySize"],
    },
  },
];
```

---

### 3. Tool Handlers

```typescript
// server/toolHandlers.ts
//
// Each key in this object matches a tool name in toolDefinitions.ts.
// These functions execute the actual business logic when the LLM calls a tool.
//
// Three categories of handlers:
// 1. CONVEX HANDLERS — read/write to the Convex database
// 2. EXTERNAL API HANDLERS — call Spoonacular, etc.
// 3. ORDERING HANDLERS — log to Convex + trigger Browser Use agent (future)

import { ConvexHttpClient } from "convex/browser";
import { internal } from "../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

export const toolHandlers: Record<string, (args: any) => Promise<any>> = {

  // ═══════════════════════════════════════════
  // CONVEX HANDLERS — Preference Layer
  // ═══════════════════════════════════════════

  get_preferences: async (args) => {
    const prefs = await convex.query(internal.preferences.get, {
      visitorId: args.visitorId,
    });
    if (!prefs) {
      // First-time user — create defaults
      await convex.mutation(internal.preferences.createDefaults, {
        visitorId: args.visitorId,
      });
      return await convex.query(internal.preferences.get, {
        visitorId: args.visitorId,
      });
    }
    return prefs;
  },

  update_preferences: async (args) => {
    const { visitorId, ...updates } = args;
    return await convex.mutation(internal.preferences.update, {
      visitorId,
      updates,
    });
  },

  // ═══════════════════════════════════════════
  // CONVEX HANDLERS — Plan Layer
  // ═══════════════════════════════════════════

  create_meal_plan: async (args) => {
    return await convex.mutation(internal.mealPlans.create, {
      visitorId: args.visitorId,
      weekStartDate: args.weekStartDate,
    });
  },

  get_meal_plan: async (args) => {
    return await convex.query(internal.mealPlans.getWithMeals, {
      visitorId: args.visitorId,
      weekStartDate: args.weekStartDate,
    });
  },

  update_meal: async (args) => {
    return await convex.mutation(internal.mealPlans.upsertMeal, {
      mealPlanId: args.mealPlanId,
      visitorId: args.visitorId,
      day: args.day,
      mealType: args.mealType,
      recipeId: args.recipeId,
      recipeName: args.recipeName,
      recipeImageUrl: args.recipeImageUrl,
      sourceUrl: args.sourceUrl,
      calories: args.calories,
      protein: args.protein,
      carbs: args.carbs,
      fat: args.fat,
      ingredients: args.ingredients || [],
      isManualOverride: args.isManualOverride || false,
    });
  },

  remove_meal: async (args) => {
    return await convex.mutation(internal.mealPlans.skipMeal, {
      mealPlanId: args.mealPlanId,
      day: args.day,
      mealType: args.mealType,
    });
  },

  // ═══════════════════════════════════════════
  // CONVEX HANDLERS — Grocery List
  // ═══════════════════════════════════════════

  generate_grocery_list: async (args) => {
    return await convex.mutation(internal.groceryList.generate, {
      mealPlanId: args.mealPlanId,
      visitorId: args.visitorId,
    });
  },

  get_grocery_list: async (args) => {
    return await convex.query(internal.groceryList.get, {
      mealPlanId: args.mealPlanId,
    });
  },

  // ═══════════════════════════════════════════
  // EXTERNAL API HANDLERS — Spoonacular
  // These do NOT touch Convex. They call Spoonacular directly.
  // ═══════════════════════════════════════════

  search_recipes: async (args) => {
    const params = new URLSearchParams({
      ...(args.diet && { diet: args.diet }),
      ...(args.intolerances && { intolerances: args.intolerances }),
      ...(args.cuisine && { cuisine: args.cuisine }),
      ...(args.excludeIngredients && { excludeIngredients: args.excludeIngredients }),
      ...(args.maxCalories && { maxCalories: String(args.maxCalories) }),
      ...(args.query && { query: args.query }),
      number: "5",
      addRecipeInformation: "true",
      addRecipeNutrition: "true",
      apiKey: process.env.SPOONACULAR_API_KEY!,
    });
    const res = await fetch(
      `https://api.spoonacular.com/recipes/complexSearch?${params}`
    );
    return await res.json();
  },

  get_recipe_details: async (args) => {
    const res = await fetch(
      `https://api.spoonacular.com/recipes/${args.recipeId}/information?includeNutrition=true&apiKey=${process.env.SPOONACULAR_API_KEY}`
    );
    return await res.json();
  },

  // ═══════════════════════════════════════════
  // ORDERING HANDLERS — Browser Use Agent Integration
  //
  // These handlers do two things:
  // 1. Log an order event to Convex (always — this is the audit trail)
  // 2. Trigger the Browser Use agent to automate the ordering flow (FUTURE)
  //
  // The Browser Use agent will be a separate module that receives
  // the order details and programmatically controls a browser to
  // complete the order on DoorDash/Instacart/OpenTable.
  //
  // Integration pattern (future):
  //   import { browserUseAgent } from "../agents/browserUse";
  //   await browserUseAgent.execute({
  //     service: "doordash",
  //     task: "order",
  //     params: { recipeName, deliveryAddress, ... }
  //   });
  // ═══════════════════════════════════════════

  initiate_doordash_order: async (args) => {
    // Step 1: Log the order event to Convex
    const eventId = await convex.mutation(internal.orderEvents.create, {
      visitorId: args.visitorId,
      mealPlanId: args.mealPlanId,
      plannedMealId: args.plannedMealId,
      service: "doordash",
      action: "initiated",
      details: JSON.stringify({
        recipeName: args.recipeName,
        deliveryAddress: args.deliveryAddress,
      }),
    });

    // Step 2: Trigger Browser Use agent
    // TODO: Integrate Browser Use agent here
    // The agent will:
    // - Open DoorDash in a browser
    // - Search for the recipe/restaurant
    // - Add items to cart
    // - Enter delivery address
    // - Pause for user confirmation before placing order
    //
    // On completion, update the order event:
    // await convex.mutation(internal.orderEvents.create, {
    //   ...same fields,
    //   action: "confirmed" or "failed",
    //   details: JSON.stringify({ orderId, estimatedDelivery, ... }),
    // });

    return {
      eventId,
      status: "initiated",
      message: "DoorDash order initiated. Browser Use agent integration pending.",
    };
  },

  initiate_instacart_order: async (args) => {
    // Step 1: Get the grocery list to know what to order
    const groceryList = await convex.query(internal.groceryList.get, {
      mealPlanId: args.mealPlanId,
    });

    // Step 2: Log the order event
    const eventId = await convex.mutation(internal.orderEvents.create, {
      visitorId: args.visitorId,
      mealPlanId: args.mealPlanId,
      service: "instacart",
      action: "initiated",
      details: JSON.stringify({
        deliveryAddress: args.deliveryAddress,
        itemCount: groceryList?.items?.length || 0,
      }),
    });

    // Step 3: Trigger Browser Use agent
    // TODO: Integrate Browser Use agent here
    // The agent will:
    // - Open Instacart in a browser
    // - Add each grocery item to cart
    // - Set delivery address and time
    // - Pause for user confirmation before placing order

    return {
      eventId,
      status: "initiated",
      message: "Instacart order initiated. Browser Use agent integration pending.",
    };
  },

  initiate_opentable_reservation: async (args) => {
    // Step 1: Log the order event
    const eventId = await convex.mutation(internal.orderEvents.create, {
      visitorId: args.visitorId,
      mealPlanId: args.mealPlanId,
      service: "opentable",
      action: "initiated",
      details: JSON.stringify({
        cuisine: args.cuisine,
        location: args.location,
        date: args.date,
        time: args.time,
        partySize: args.partySize,
      }),
    });

    // Step 2: Trigger Browser Use agent
    // TODO: Integrate Browser Use agent here
    // The agent will:
    // - Open OpenTable in a browser
    // - Search for restaurants matching cuisine + location
    // - Find available reservation matching date/time/party size
    // - Pause for user confirmation before booking

    return {
      eventId,
      status: "initiated",
      message: "OpenTable reservation initiated. Browser Use agent integration pending.",
    };
  },
};
```

---

### 4. API Route

```typescript
// app/api/chat/route.ts
//
// This is the "server" — the single endpoint the frontend calls.

import { handleUserMessage } from "../../../server/orchestrationAgent";

// In-memory conversation store (hackathon only — resets on server restart)
const sessions = new Map<string, any[]>();

export async function POST(req: Request) {
  const { visitorId, message } = await req.json();

  if (!visitorId || !message) {
    return Response.json({ error: "visitorId and message are required" }, { status: 400 });
  }

  // Get or create conversation history
  const history = sessions.get(visitorId) || [];

  try {
    const { reply, conversationHistory } = await handleUserMessage(
      visitorId,
      message,
      history
    );

    // Save updated history
    sessions.set(visitorId, conversationHistory);

    return Response.json({ reply });
  } catch (error: any) {
    console.error("Orchestration agent error:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
```

---

## Data Flow Examples

These show the exact sequence of tool calls for common user requests. The orchestration agent loop handles the back-and-forth automatically.

### User: "Plan my meals for the week"

```
LLM calls: get_preferences
  → Returns: { dietaryRestrictions: ["vegetarian"], cuisinePreferences: ["mediterranean"], calorieTarget: 2000, mealSlots: ["breakfast", "lunch", "dinner"] }

LLM calls: create_meal_plan { weekStartDate: "2026-03-02" }
  → Returns: mealPlanId

LLM calls: search_recipes { diet: "vegetarian", cuisine: "mediterranean", maxCalories: 500, query: "breakfast" }
  → Returns: list of recipes

LLM calls: update_meal { mealPlanId, day: "monday", mealType: "breakfast", recipeId: "123", recipeName: "Mediterranean Egg Scramble", ... isManualOverride: false }
  → Returns: success

... repeats search_recipes + update_meal for each day/slot ...

LLM calls: generate_grocery_list { mealPlanId }
  → Returns: consolidated list

LLM responds with text: "Here's your meal plan for the week! I've planned 21 meals..."
```

### User: "I'm going keto" (preference change → plan propagation)

```
LLM calls: update_preferences { dietaryRestrictions: ["keto"] }
  → Returns: success

LLM calls: get_meal_plan { weekStartDate: "2026-03-02" }
  → Returns: plan with all meals, some have isManualOverride: true

For each meal where isManualOverride is false:
  LLM calls: search_recipes { diet: "keto", ... }
  LLM calls: update_meal { ... isManualOverride: false }

LLM calls: generate_grocery_list { mealPlanId }

LLM responds: "I've updated your preferences to keto and swapped out 18 meals. I kept Thursday's dinner (pasta) since you specifically chose that one."
```

### User: "Swap Tuesday dinner for something with salmon" (one-time plan edit)

```
LLM calls: search_recipes { query: "salmon", diet: "keto", maxCalories: 600 }
  → Returns: list of salmon recipes

LLM calls: update_meal { day: "tuesday", mealType: "dinner", recipeId: "456", recipeName: "Keto Garlic Butter Salmon", ... isManualOverride: true }

LLM responds: "Done — I swapped Tuesday's dinner to Keto Garlic Butter Salmon (480 cal). Want me to update the grocery list?"
```

### User: "Order tonight's dinner from DoorDash"

```
LLM calls: get_meal_plan { weekStartDate: "2026-03-02" }
  → Returns: finds today's dinner is "Keto Garlic Butter Salmon"

LLM responds with text: "Tonight's dinner is Keto Garlic Butter Salmon. Your delivery address is 123 Main St. Should I go ahead and order this from DoorDash?"

User: "Yes"

LLM calls: initiate_doordash_order { mealPlanId, plannedMealId, recipeName: "Keto Garlic Butter Salmon", deliveryAddress: "123 Main St" }
  → Returns: { status: "initiated" }

LLM responds: "I've started the DoorDash order for Keto Garlic Butter Salmon. You'll get a confirmation once it's placed."
```

---

## Browser Use Agent Integration Points

When the Browser Use agent is ready, the integration happens ONLY in `toolHandlers.ts`. No other file changes. The pattern:

```typescript
// In toolHandlers.ts, the ordering handlers change from:

initiate_doordash_order: async (args) => {
  const eventId = await convex.mutation(internal.orderEvents.create, { ... });
  // TODO: Trigger Browser Use agent here
  return { eventId, status: "initiated" };
},

// To:

initiate_doordash_order: async (args) => {
  const eventId = await convex.mutation(internal.orderEvents.create, { ... });

  // Trigger Browser Use agent
  const result = await browserUseAgent.execute({
    service: "doordash",
    task: "order_meal",
    params: {
      recipeName: args.recipeName,
      deliveryAddress: args.deliveryAddress,
    },
  });

  // Log the result
  await convex.mutation(internal.orderEvents.create, {
    visitorId: args.visitorId,
    mealPlanId: args.mealPlanId,
    service: "doordash",
    action: result.success ? "confirmed" : "failed",
    details: JSON.stringify(result),
  });

  return { eventId, status: result.success ? "confirmed" : "failed", ...result };
},
```

The orchestration agent loop, tool definitions, Convex schema, and frontend code do NOT change. The Browser Use agent is an implementation detail inside the tool handler.
