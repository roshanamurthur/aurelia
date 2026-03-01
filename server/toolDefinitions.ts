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
          takeoutDays: {
            type: "array",
            items: {
              type: "string",
              enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
            },
            description: "Days for takeout/delivery. e.g. ['friday', 'saturday'].",
          },
          takeoutSlots: {
            type: "array",
            items: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
            description: "Which meals are takeout on takeoutDays. e.g. ['dinner'] or ['lunch','dinner']. Default dinner only if unspecified.",
          },
          dineoutDays: {
            type: "array",
            items: {
              type: "string",
              enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
            },
            description: "Days for dine-out (OpenTable reservations). e.g. ['friday', 'saturday'].",
          },
          dineoutSlots: {
            type: "array",
            items: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
            description: "Which meals are dine-out on dineoutDays. e.g. ['dinner']. Default dinner only if unspecified.",
          },
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
      name: "get_active_plan",
      description:
        "Returns the user's currently active meal plan with all meals, or null if none exists. Use this FIRST before any meal modification — it gives you the mealPlanId needed for update_meal, remove_meal, etc. No date arithmetic required. This is the primary way to look up the current plan.",
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
      name: "create_meal_plan",
      description:
        "Creates a new empty weekly meal plan for a given week. If a plan already exists for that week, returns the existing plan ID. Archives any previous active plans. IMPORTANT: After calling this, you MUST call populate_meal_plan with the returned mealPlanId to fill the meal slots. NEVER use search_recipes + update_meal to fill a full plan.",
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
        "Assigns or replaces a SINGLE meal in a specific day/meal slot. Use ONLY for individual meal swaps or takeout. For filling an entire plan, use populate_meal_plan instead. Two modes: (1) HOME-COOKED: search_recipes first, then call this with the Spoonacular recipeId and COMPLETE ingredients array. Meals without ingredients produce empty grocery lists. (2) TAKEOUT: set isTakeout=true, use a placeholder recipeId like 'takeout-doordash', and specify takeoutService. No ingredients needed for takeout.",
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
          recipeId: { type: "string", description: "Spoonacular recipe ID for home-cooked meals, or a placeholder like 'takeout-doordash' for takeout." },
          recipeName: {
            type: "string",
            description:
              "Display name. For TAKEOUT: use EXACT names from get_sf_meals (e.g. 'Ike's Love and Sandwiches Menage a Trois'). Never use generic labels like 'Mexican takeout'.",
          },
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
            description: "REQUIRED for home-cooked meals — meals without ingredients produce empty grocery lists. Include the complete ingredient list from search_recipes or get_recipe_details. Not needed for takeout meals.",
          },
          isManualOverride: {
            type: "boolean",
            description: "Set true if the user explicitly chose this meal. Protects it from preference propagation.",
          },
          isTakeout: {
            type: "boolean",
            description: "Set true when the meal is takeout/delivery instead of home-cooked. Takeout meals are excluded from the grocery list.",
          },
          takeoutService: {
            type: "string",
            enum: ["doordash", "instacart", "opentable"],
            description: "Which ordering service to use for this takeout meal.",
          },
          takeoutDetails: {
            type: "string",
            description: "JSON string with order metadata (restaurant name, special instructions, etc.).",
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
  // BULK PLAN POPULATION
  // ═══════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "populate_meal_plan",
      description:
        "Populates an entire weekly meal plan in one call. Searches Spoonacular for recipes matching dietary constraints, deduplicates server-side, writes all meals in a single batch, and auto-generates the grocery list. Use this for initial plan generation and preference propagation. Do NOT use search_recipes + update_meal individually for full plan population — that is slow and error-prone. For single-meal swaps, continue using search_recipes + update_meal.",
      parameters: {
        type: "object",
        properties: {
          mealPlanId: { type: "string", description: "The Convex ID of the meal plan." },
          days: {
            type: "array",
            items: {
              type: "string",
              enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
            },
            description: "Days to populate. e.g. ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].",
          },
          mealSlots: {
            type: "array",
            items: {
              type: "string",
              enum: ["breakfast", "lunch", "dinner", "snack"],
            },
            description: "Meal types to fill. e.g. ['breakfast','lunch','dinner'].",
          },
          diet: { type: "string", description: "e.g. 'vegetarian', 'keto', 'paleo'." },
          intolerances: { type: "string", description: "Comma-separated. e.g. 'peanut,shellfish'." },
          cuisine: { type: "string", description: "Comma-separated preferred cuisines. e.g. 'mediterranean,japanese'." },
          excludeIngredients: { type: "string", description: "Comma-separated. e.g. 'cilantro,olives'." },
          maxCalories: { type: "number", description: "Max calories per serving." },
          excludeRecipeIds: {
            type: "array",
            items: { type: "string" },
            description: "Recipe IDs to exclude (e.g. manually overridden meals to preserve). These will not be assigned to any slot.",
          },
          takeoutDays: {
            type: "array",
            items: {
              type: "string",
              enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
            },
            description:
              "Days when the user wants takeout/delivery. Those day+slot combos get exact SF meal names from our curated list (e.g. Ike's Love and Sandwiches Menage a Trois). Pass from user prefs or conversation.",
          },
          takeoutSlots: {
            type: "array",
            items: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
            description: "Which meal slots are takeout on takeoutDays. Use ONLY the meals the user requested. If unspecified, default to ['dinner'] only. Never assume all meals.",
          },
          dineoutDays: {
            type: "array",
            items: {
              type: "string",
              enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
            },
            description:
              "Days when the user wants to dine out (OpenTable reservations). Those slots get SF restaurant names. Pass when user says e.g. 'dine out on Saturdays'.",
          },
          dineoutSlots: {
            type: "array",
            items: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
            description: "Which meal slots are dine-out on dineoutDays. Default: ['dinner'].",
          },
        },
        required: ["mealPlanId", "days", "mealSlots"],
      },
    },
  },

  // ═══════════════════════════════════════════
  // RECIPE DISCOVERY TOOLS
  // ═══════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "get_sf_meals",
      description:
        "Returns the curated list of SF restaurant meals for takeout. Use these EXACT names when calling update_meal for takeout (recipeName). Never use generic labels like 'Mexican takeout'.",
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
      name: "get_sf_restaurants",
      description:
        "Returns the curated list of SF restaurants on OpenTable for dine-out reservations. ALWAYS call this before adding a dine-out slot or when the user asks about restaurants. Returns { restaurants: string[] }. Use these EXACT names as recipeName when calling update_meal with takeoutService='opentable'.",
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
        "Initiates a DoorDash delivery order for a specific planned meal. Call AFTER marking the slot as takeout with update_meal (isTakeout=true, takeoutService='doordash'). Triggers the Browser Use agent to place the order. ALWAYS confirm the meal details and delivery address with the user before calling this.",
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
  // MEMORY TOOLS — SuperMemory (long-horizon taste intelligence)
  // ═══════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "store_memory",
      description:
        "Stores a taste observation or preference insight in the user's long-term memory. Use this to capture nuanced signals that go beyond structured preferences — things like 'loves spicy Thai basil dishes', 'dislikes mushy textures', 'craves comfort food on rainy days', 'enjoys meal prepping on Sundays'. Call this whenever the user reveals a taste pattern, cooking habit, or food opinion during conversation. Each memory should be a single, specific observation.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description:
              "A clear, specific observation about the user's taste or habits. Write as a declarative sentence. e.g. 'Prefers crunchy textures over soft ones', 'Enjoys Japanese-Peruvian fusion (Nikkei cuisine)'.",
          },
          category: {
            type: "string",
            enum: [
              "taste_preference",
              "texture_preference",
              "cuisine_affinity",
              "ingredient_opinion",
              "cooking_habit",
              "meal_feedback",
            ],
            description: "Category of the memory for better organization.",
          },
        },
        required: ["content", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_memories",
      description:
        "Searches the user's long-term memory for relevant taste preferences and past observations. Call this BEFORE searching for recipes to incorporate nuanced taste intelligence beyond structured preferences. Also call this when the user asks 'what do you know about me?' or references past conversations. Use specific queries like 'breakfast preferences' or 'feelings about spicy food' for best results.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Semantic search query. Be specific. e.g. 'breakfast preferences and morning routines', 'opinions on Italian food', 'texture preferences'.",
          },
          limit: {
            type: "number",
            description: "Max results to return (1-20). Default 10.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_taste_profile",
      description:
        "Retrieves the user's synthesized taste profile — a high-level summary of their food personality built from accumulated memories. Returns both static traits (enduring preferences) and dynamic traits (recent/evolving tastes). Call this when generating a new meal plan to get a holistic view of the user's palate, or when the user asks about their food profile.",
      parameters: {
        type: "object",
        properties: {
          context: {
            type: "string",
            description:
              "Optional context to focus the profile. e.g. 'planning weeknight dinners', 'looking for healthy lunches'. When provided, also returns relevant search results.",
          },
        },
        required: [],
      },
    },
  },

  // ═══════════════════════════════════════════
  // TIKTOK & CUSTOM RECIPE TOOLS
  // ═══════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "extract_tiktok_recipe",
      description:
        "Extracts a recipe from a TikTok video. Browser Use reads the caption, on-screen text, and comments to get the dish name, ingredients, instructions, and nutrition. Returns extracted data that should be saved via save_custom_recipe and assigned to a meal slot via update_meal.",
      parameters: {
        type: "object",
        properties: {
          videoUrl: {
            type: "string",
            description: "The TikTok video URL.",
          },
        },
        required: ["videoUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_custom_recipe",
      description:
        "Saves a custom recipe to the user's personal recipe collection. These are reusable — the user can reference them by name in future meal plans. Call this after extracting a recipe from TikTok or when the user describes a personal recipe.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Dish name." },
          source: {
            type: "string",
            enum: ["tiktok", "instagram", "youtube", "manual"],
            description: "Where the recipe came from.",
          },
          sourceUrl: { type: "string", description: "Original URL (TikTok link, etc.)." },
          creator: { type: "string", description: "@handle of the recipe creator." },
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
            description: "Ingredient list with amounts and units.",
          },
          instructions: { type: "string", description: "Step-by-step cooking instructions." },
          calories: { type: "number", description: "Calories per serving." },
          protein: { type: "number", description: "Protein in grams." },
          carbs: { type: "number", description: "Carbs in grams." },
          fat: { type: "number", description: "Fat in grams." },
        },
        required: ["name", "source"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_custom_recipes",
      description:
        "Searches the user's saved custom recipes by name. Use when the user references a previously saved recipe (e.g., 'that buffalo chicken wrap from TikTok'). Returns matching recipes with full ingredient/nutrition data.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search term to match against recipe names.",
          },
        },
        required: ["query"],
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
