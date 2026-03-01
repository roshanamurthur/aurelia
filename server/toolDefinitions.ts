// server/toolDefinitions.ts
//
// JSON schemas sent to the LLM with every API call.
// OpenAI function calling format.
// Every entry here MUST have a matching handler in toolHandlers.ts.

import { ChatCompletionTool } from "openai/resources/chat/completions";

export const toolDefinitions: ChatCompletionTool[] = [
  // ═══════════════════════════════════════════
  // PREFERENCE LAYER TOOLS
  // ═══════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "get_preferences",
      description:
        "Retrieves the user's stored dietary preferences, nutritional targets, cuisine preferences, allergies, and logistics settings. Call this before searching for recipes to ensure results match user constraints. Also call this when the user asks about their current settings.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_preferences",
      description:
        "Updates one or more of the user's persistent preference settings. Use ONLY when the user expresses a lasting dietary change (e.g., 'I'm going vegetarian', 'I'm allergic to shellfish', 'I want to target 2000 calories a day'). Do NOT use for one-time meal swaps. After calling this, re-evaluate affected meals in the active plan.",
      parameters: {
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
  },

  // ═══════════════════════════════════════════
  // PLAN LAYER TOOLS
  // ═══════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "create_meal_plan",
      description:
        "Creates a new empty weekly meal plan for a given week. Call this once before populating meals for a new week. If a plan already exists for that week, returns the existing plan ID.",
      parameters: {
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
  },
  {
    type: "function",
    function: {
      name: "get_meal_plan",
      description:
        "Retrieves the full meal plan for a given week, including all planned meals with their recipes, nutrition data, and status. Call this when the user asks to see their plan or when you need to evaluate existing meals before making changes.",
      parameters: {
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
  },
  {
    type: "function",
    function: {
      name: "update_meal",
      description:
        "Assigns or replaces a recipe in a specific day/meal slot in the plan. You MUST call search_recipes first to get a valid recipeId — never invent a recipe ID. Set isManualOverride to true if the user explicitly requested this specific meal.",
      parameters: {
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
          sourceUrl: { type: "string", description: "URL of the recipe source page." },
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
            description: "Ingredient list for this recipe.",
          },
          isManualOverride: {
            type: "boolean",
            description: "Set true if the user explicitly chose this meal. Protects it from preference propagation.",
          },
        },
        required: ["mealPlanId", "day", "mealType", "recipeId", "recipeName", "isManualOverride"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_meal",
      description: "Marks a meal slot as skipped. Use when the user wants to remove a meal without replacing it.",
      parameters: {
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
  },

  // ═══════════════════════════════════════════
  // RECIPE DISCOVERY TOOLS
  // ═══════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "search_recipes",
      description:
        "Searches Spoonacular for recipes matching dietary filters. Always incorporate the user's preferences as base filters (call get_preferences first if you haven't already). Returns a list of recipes with IDs, names, images, and nutrition data. To ensure variety across a weekly plan, use DIFFERENT query keywords, vary cuisines, and use the offset parameter to get different result pages.",
      parameters: {
        type: "object",
        properties: {
          diet: { type: "string", description: "e.g. 'vegetarian', 'keto', 'paleo'." },
          intolerances: { type: "string", description: "Comma-separated. e.g. 'peanut,shellfish'." },
          cuisine: { type: "string", description: "e.g. 'mediterranean', 'japanese'." },
          excludeIngredients: { type: "string", description: "Comma-separated. e.g. 'cilantro,olives'." },
          maxCalories: { type: "number", description: "Max calories per serving." },
          query: { type: "string", description: "Optional keyword. e.g. 'salmon', 'quick breakfast'." },
          mealType: { type: "string", description: "e.g. 'breakfast', 'main course', 'snack'." },
          offset: { type: "number", description: "Number of results to skip for pagination. Use different offsets to get varied results across multiple searches." },
          number: { type: "number", description: "Number of recipes to return (1-10). Default 5." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recipe_details",
      description:
        "Gets full details for a specific recipe including complete ingredient list and nutrition breakdown. Use this after search_recipes if you need the full ingredient list to write to the plan.",
      parameters: {
        type: "object",
        properties: {
          recipeId: { type: "string", description: "Spoonacular recipe ID." },
        },
        required: ["recipeId"],
      },
    },
  },

  // ═══════════════════════════════════════════
  // GROCERY TOOLS
  // ═══════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "generate_grocery_list",
      description:
        "Consolidates all ingredients from non-skipped meals in the plan into a deduplicated grocery list. Call this after populating or modifying the meal plan.",
      parameters: {
        type: "object",
        properties: {
          mealPlanId: { type: "string", description: "The Convex ID of the meal plan." },
        },
        required: ["mealPlanId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_grocery_list",
      description: "Retrieves the current grocery list for a meal plan.",
      parameters: {
        type: "object",
        properties: {
          mealPlanId: { type: "string", description: "The Convex ID of the meal plan." },
        },
        required: ["mealPlanId"],
      },
    },
  },

  // ═══════════════════════════════════════════
  // ORDERING / EXECUTION TOOLS (Browser Use agent - future)
  // ═══════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "initiate_doordash_order",
      description:
        "Initiates a DoorDash delivery order for a specific planned meal. ALWAYS confirm the meal details and delivery address with the user before calling this.",
      parameters: {
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
  },
  {
    type: "function",
    function: {
      name: "initiate_instacart_order",
      description:
        "Initiates an Instacart grocery delivery order from the grocery list. ALWAYS confirm with the user before calling this.",
      parameters: {
        type: "object",
        properties: {
          mealPlanId: { type: "string", description: "The Convex ID of the meal plan." },
          deliveryAddress: { type: "string", description: "Delivery address." },
        },
        required: ["mealPlanId", "deliveryAddress"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "initiate_opentable_reservation",
      description:
        "Initiates an OpenTable restaurant reservation. ALWAYS confirm details with the user before calling this.",
      parameters: {
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
  },

  // ═══════════════════════════════════════════
  // INTAKE FLOW TOOLS
  // ═══════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "intake_complete",
      description:
        "Signals that the initial intake flow is finished — the user's preferences have been saved AND a complete weekly meal plan has been generated with all requested meal slots filled. Call this exactly once after the first full plan generation. Do NOT call this for ongoing plan modifications or swaps.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];
