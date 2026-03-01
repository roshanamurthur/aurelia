// server/toolHandlers.ts
//
// Each key matches a tool name in toolDefinitions.ts.
// Three categories:
// 1. CONVEX HANDLERS — read/write to Convex (auth via forwarded token)
// 2. EXTERNAL API HANDLERS — call Spoonacular
// 3. ORDERING HANDLERS — log to Convex + trigger Browser Use agent (future)

import { ConvexHttpClient } from "convex/browser";
import Supermemory from "supermemory";
import { api } from "../convex/_generated/api";
import { SF_MEALS, pickTakeoutMealForSlot } from "./sfMeals";
import { pickRestaurantForSlot } from "./sfRestaurants";

export function createToolHandlers(authToken: string) {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  convex.setAuth(authToken);

  const supermemory =
    process.env.SUPERMEMORY_API_KEY
      ? new Supermemory({ apiKey: process.env.SUPERMEMORY_API_KEY })
      : null;

  // Cache userId for the session to avoid repeated queries
  let cachedUserId: string | null = null;
  async function getUserId(): Promise<string> {
    if (cachedUserId) return cachedUserId;
    let prefs = await convex.query(api.preferences.get, {});
    if (!prefs) {
      await convex.mutation(api.preferences.createDefaults, {});
      prefs = await convex.query(api.preferences.get, {});
    }
    if (!prefs?.userId) throw new Error("Could not resolve userId from auth");
    cachedUserId = prefs.userId;
    return cachedUserId;
  }

  function containerTag(userId: string): string {
    return `aurelia-user-${userId}`;
  }

  const handlers: Record<string, (args: any) => Promise<any>> = {
    // ═══════════════════════════════════════════
    // CONVEX HANDLERS — Preference Layer
    // ═══════════════════════════════════════════

    get_preferences: async () => {
      const prefs = await convex.query(api.preferences.get, {});
      if (!prefs) {
        await convex.mutation(api.preferences.createDefaults, {});
        return await convex.query(api.preferences.get, {});
      }
      return prefs;
    },

    update_preferences: async (args: any) => {
      return await convex.mutation(api.preferences.update, args);
    },

    // ═══════════════════════════════════════════
    // CONVEX HANDLERS — Plan Layer
    // ═══════════════════════════════════════════

    get_active_plan: async () => {
      const plan = await convex.query(api.mealPlans.getActivePlan, {});
      if (!plan) return { plan: null, message: "No active meal plan. Create one with create_meal_plan." };
      // Normalize: expose mealPlanId (not raw _id) for consistency with all other tools
      return {
        mealPlanId: plan._id,
        weekStartDate: plan.weekStartDate,
        status: plan.status,
        meals: plan.meals?.map((m: any) => ({
          day: m.day,
          mealType: m.mealType,
          recipeId: m.recipeId,
          recipeName: m.recipeName,
          calories: m.calories,
          protein: m.protein,
          carbs: m.carbs,
          fat: m.fat,
          isTakeout: m.isTakeout,
          isManualOverride: m.isManualOverride,
          isSkipped: m.isSkipped,
        })),
      };
    },

    create_meal_plan: async (args: any) => {
      const result = await convex.mutation(api.mealPlans.create, {
        weekStartDate: args.weekStartDate,
      });
      return {
        ...result,
        nextStep: `Call populate_meal_plan with mealPlanId "${result.mealPlanId}" to fill all meal slots. Do NOT use search_recipes + update_meal individually.`,
      };
    },

    get_meal_plan: async (args: any) => {
      const plan = await convex.query(api.mealPlans.getWithMeals, {
        weekStartDate: args.weekStartDate,
      });
      if (!plan) return null;
      // Normalize: expose mealPlanId (not raw _id) so LLM can pass it to update_meal etc.
      const { _id, _creationTime, ...rest } = plan;
      return { mealPlanId: _id, ...rest };
    },

    update_meal: async (args: any) => {
      // Normalize day/mealType to lowercase — UI lookups are case-sensitive
      if (args.day) args.day = args.day.toLowerCase();
      if (args.mealType) args.mealType = args.mealType.toLowerCase();

      // Validate ingredients array — LLM sometimes sends malformed JSON
      let ingredients = Array.isArray(args.ingredients)
        ? args.ingredients.filter(
            (i: any) =>
              i && typeof i.name === "string" && typeof i.amount === "number" && typeof i.unit === "string"
          )
        : undefined;
      if (ingredients && ingredients.length === 0) ingredients = undefined;

      // For home-cooked meals: if ingredients missing and recipeId is numeric,
      // fetch from Spoonacular as a safety net
      if (!args.isTakeout && !ingredients && /^\d+$/.test(args.recipeId)) {
        try {
          const res = await fetch(
            `https://api.spoonacular.com/recipes/${args.recipeId}/information?includeNutrition=false&apiKey=${process.env.SPOONACULAR_API_KEY}`
          );
          if (res.ok) {
            const data = await res.json();
            ingredients = data.extendedIngredients?.map((i: any) => ({
              name: i.name,
              amount: i.amount,
              unit: i.unit,
            })) || undefined;
          }
        } catch {
          // Non-fatal: proceed without ingredients
        }
      }

      // For takeout meals, clear ingredients and auto-fill calories from SF_MEALS if missing
      let calories = args.calories;
      if (args.isTakeout && args.recipeName) {
        ingredients = undefined;
        if (calories == null) {
          const match = SF_MEALS.find(
            (m) => m.name.toLowerCase().trim() === String(args.recipeName).toLowerCase().trim()
          );
          if (match) calories = match.calories;
        }
      }

      // Soft dedup check: warn about duplicates but still allow the write
      let duplicateWarning: string | undefined;
      if (!args.isTakeout && args.recipeId && !/^takeout-/.test(args.recipeId)) {
        try {
          const existingMeals = await convex.query(api.mealPlans.getMealsByPlanId, {
            mealPlanId: args.mealPlanId,
          });
          const duplicate = existingMeals.find(
            (m: any) =>
              m.recipeId === args.recipeId &&
              !(m.day === args.day && m.mealType === args.mealType)
          );
          if (duplicate) {
            duplicateWarning = `Note: this recipe is also assigned to ${duplicate.day} ${duplicate.mealType}.`;
          }
        } catch {
          // Non-fatal: proceed without dedup check
        }
      }

      const result = await convex.mutation(api.mealPlans.upsertMeal, {
        mealPlanId: args.mealPlanId,
        day: args.day,
        mealType: args.mealType,
        recipeId: args.recipeId,
        recipeName: args.recipeName,
        recipeImageUrl: args.recipeImageUrl,
        sourceUrl: args.sourceUrl,
        calories: calories ?? args.calories,
        protein: args.protein,
        carbs: args.carbs,
        fat: args.fat,
        ingredients,
        isManualOverride: args.isManualOverride ?? false,
        isTakeout: args.isTakeout ?? false,
        takeoutService: args.isTakeout ? args.takeoutService : undefined,
        takeoutDetails: args.isTakeout ? args.takeoutDetails : undefined,
      });
      if (duplicateWarning) {
        return { ...result, duplicateWarning };
      }
      return result;
    },

    populate_meal_plan: async (args: any) => {
      // Normalize to lowercase — UI lookups are case-sensitive
      const mealPlanId = args.mealPlanId;
      const days = (args.days as string[]).map((d: string) => d.toLowerCase());
      const mealSlots = (args.mealSlots as string[]).map((s: string) => s.toLowerCase());
      const excludeRecipeIds = args.excludeRecipeIds || [];
      const takeoutDays = ((args.takeoutDays as string[]) || []).map((d: string) => d.toLowerCase());
      const takeoutSlots = ((args.takeoutSlots as string[]) || ["dinner"]).map((s: string) => s.toLowerCase());
      const dineoutDays = ((args.dineoutDays as string[]) || []).map((d: string) => d.toLowerCase());
      const dineoutSlots = ((args.dineoutSlots as string[]) || ["dinner"]).map((s: string) => s.toLowerCase());
      const isTakeoutSlot = (day: string, slot: string) =>
        takeoutDays.includes(day) && takeoutSlots.includes(slot);
      const isDineoutSlot = (day: string, slot: string) =>
        dineoutDays.includes(day) && dineoutSlots.includes(slot);

      // Guard: Spoonacular API key must exist
      const spoonKey = process.env.SPOONACULAR_API_KEY;
      if (!spoonKey) {
        return { success: false, error: "SPOONACULAR_API_KEY is not configured. Cannot search for recipes." };
      }

      // Build Spoonacular base params from dietary constraints
      const baseParams: Record<string, string> = {
        addRecipeInformation: "true",
        addRecipeNutrition: "true",
        sort: "popularity",
        apiKey: spoonKey,
      };
      if (args.diet) baseParams.diet = args.diet;
      if (args.intolerances) baseParams.intolerances = args.intolerances;
      if (args.cuisine) baseParams.cuisine = args.cuisine;
      if (args.excludeIngredients) baseParams.excludeIngredients = args.excludeIngredients;
      if (args.maxCalories) baseParams.maxCalories = String(args.maxCalories);

      // Per-slot search config: different Spoonacular types AND query keywords
      // to ensure lunch vs dinner get different result pools
      const slotSearchConfig: Record<string, { type: string; queries: string[] }> = {
        breakfast: { type: "breakfast", queries: ["breakfast", "morning"] },
        lunch: { type: "main course", queries: ["lunch", "salad"] },
        dinner: { type: "main course", queries: ["dinner", "hearty"] },
        snack: { type: "snack", queries: ["snack", "light"] },
      };

      // Search Spoonacular: 2 calls per meal slot (different queries), all in parallel
      const uniqueSlots = [...new Set(mealSlots)];
      const errors: string[] = [];
      const searchPromises = uniqueSlots.flatMap((slot) => {
        const config = slotSearchConfig[slot] || { type: "main course", queries: ["meal"] };
        return config.queries.map(async (query, i) => {
          const params = new URLSearchParams({
            ...baseParams,
            type: config.type,
            query,
            number: "15",
            offset: String(i * 15),
          });
          try {
            const res = await fetch(
              `https://api.spoonacular.com/recipes/complexSearch?${params}`
            );
            if (!res.ok) {
              const text = await res.text().catch(() => "");
              errors.push(`Spoonacular ${res.status} for ${slot}/${query}: ${text.slice(0, 100)}`);
              return [];
            }
            const data = await res.json();
            return (data.results || []).map((r: any) => ({
              id: String(r.id),
              title: r.title,
              image: r.image,
              sourceUrl: r.sourceUrl,
              calories: r.nutrition?.nutrients?.find((n: any) => n.name === "Calories")?.amount,
              protein: r.nutrition?.nutrients?.find((n: any) => n.name === "Protein")?.amount,
              carbs: r.nutrition?.nutrients?.find((n: any) => n.name === "Carbohydrates")?.amount,
              fat: r.nutrition?.nutrients?.find((n: any) => n.name === "Fat")?.amount,
              ingredients: r.nutrition?.ingredients?.map((i: any) => ({
                name: i.name,
                amount: i.amount,
                unit: i.unit,
              })) || [],
              mealType: slot,
            }));
          } catch (err: any) {
            errors.push(`Spoonacular fetch error for ${slot}/${query}: ${err.message}`);
            return [];
          }
        });
      });

      const searchResults = await Promise.all(searchPromises);

      // If ALL searches failed, return an explicit error
      const totalRecipes = searchResults.reduce((n, batch) => n + batch.length, 0);
      if (totalRecipes === 0) {
        return {
          success: false,
          error: `All Spoonacular searches failed. No recipes found.${errors.length > 0 ? " Errors: " + errors.join("; ") : ""}`,
          mealsAssigned: 0,
          totalSlots: days.length * mealSlots.length,
        };
      }

      // Group recipes by meal type, deduplicate
      const excludeSet = new Set(excludeRecipeIds as string[]);
      const usedIds = new Set<string>();
      const recipesByType: Record<string, any[]> = {};

      for (const slot of uniqueSlots) {
        recipesByType[slot] = [];
      }

      for (const batch of searchResults) {
        for (const recipe of batch) {
          if (excludeSet.has(recipe.id) || usedIds.has(recipe.id)) continue;
          if (recipesByType[recipe.mealType]) {
            recipesByType[recipe.mealType].push(recipe);
            usedIds.add(recipe.id);
          }
        }
      }

      // Assign recipes to slots (skip takeout slots — filled separately)
      const meals: any[] = [];
      const typeIndex: Record<string, number> = {};
      for (const slot of uniqueSlots) {
        typeIndex[slot] = 0;
      }

      for (const day of days) {
        for (const slot of mealSlots) {
          if (isDineoutSlot(day, slot)) {
            const restaurant = pickRestaurantForSlot(day, slot);
            meals.push({
              day,
              mealType: slot,
              recipeId: "dineout-opentable",
              recipeName: restaurant.name,
              isTakeout: true,
              takeoutService: "opentable",
              takeoutDetails: restaurant.defaultTime,
            });
            continue;
          }
          if (isTakeoutSlot(day, slot)) {
            const takeout = pickTakeoutMealForSlot(day, slot);
            meals.push({
              day,
              mealType: slot,
              recipeId: "takeout-doordash",
              recipeName: takeout.name,
              calories: takeout.calories,
              isTakeout: true,
              takeoutService: "doordash",
            });
            continue;
          }

          const pool = recipesByType[slot] || [];
          const idx = typeIndex[slot] || 0;
          if (idx >= pool.length) continue; // No more unique recipes available

          const recipe = pool[idx];
          typeIndex[slot] = idx + 1;

          meals.push({
            day,
            mealType: slot,
            recipeId: recipe.id,
            recipeName: recipe.title,
            recipeImageUrl: recipe.image,
            sourceUrl: recipe.sourceUrl,
            calories: recipe.calories,
            protein: recipe.protein,
            carbs: recipe.carbs,
            fat: recipe.fat,
            ingredients: recipe.ingredients,
          });
        }
      }

      // Batch write all meals
      const totalSlots = days.length * mealSlots.length;
      if (meals.length === 0) {
        return {
          success: false,
          error: `Found ${totalRecipes} recipes from Spoonacular but none could be assigned after deduplication/filtering. Try relaxing dietary constraints.`,
          mealsAssigned: 0,
          totalSlots,
        };
      }

      const batchResult = await convex.mutation(api.mealPlans.batchUpsertMeals, {
        mealPlanId,
        meals,
      });

      // Auto-generate grocery list
      try {
        await convex.mutation(api.groceryList.generate, { mealPlanId });
      } catch {
        // Non-fatal — grocery list can be regenerated later
      }

      return {
        success: true,
        mealsAssigned: meals.length,
        totalSlots,
        meals: meals.map((m) => ({
          day: m.day,
          mealType: m.mealType,
          recipeName: m.recipeName,
          recipeId: m.recipeId,
          calories: m.calories,
        })),
        ...(meals.length < totalSlots && {
          note: `Only ${meals.length} of ${totalSlots} slots filled. You can use search_recipes + update_meal to fill remaining slots manually.`,
        }),
        ...(errors.length > 0 && { warnings: errors }),
        groceryListGenerated: true,
      };
    },

    remove_meal: async (args: any) => {
      if (args.day) args.day = args.day.toLowerCase();
      if (args.mealType) args.mealType = args.mealType.toLowerCase();
      return await convex.mutation(api.mealPlans.skipMeal, {
        mealPlanId: args.mealPlanId,
        day: args.day,
        mealType: args.mealType,
      });
    },

    // ═══════════════════════════════════════════
    // CONVEX HANDLERS — Grocery List
    // ═══════════════════════════════════════════

    generate_grocery_list: async (args: any) => {
      return await convex.mutation(api.groceryList.generate, {
        mealPlanId: args.mealPlanId,
      });
    },

    get_grocery_list: async (args: any) => {
      return await convex.query(api.groceryList.get, {
        mealPlanId: args.mealPlanId,
      });
    },

    // ═══════════════════════════════════════════
    // EXTERNAL API HANDLERS — Spoonacular
    // ═══════════════════════════════════════════

    get_sf_meals: async () => {
      return { meals: SF_MEALS.map((m) => m.name) };
    },

    get_sf_restaurants: async () => {
      return { restaurants: SF_RESTAURANTS.map((r) => r.name) };
    },

    search_recipes: async (args: any) => {
      const params = new URLSearchParams({
        ...(args.diet && { diet: args.diet }),
        ...(args.intolerances && { intolerances: args.intolerances }),
        ...(args.cuisine && { cuisine: args.cuisine }),
        ...(args.excludeIngredients && { excludeIngredients: args.excludeIngredients }),
        ...(args.maxCalories && { maxCalories: String(args.maxCalories) }),
        ...(args.query && { query: args.query }),
        ...(args.mealType && { type: args.mealType }),
        number: String(args.number || 5),
        offset: String(args.offset || 0),
        sort: "popularity",
        addRecipeInformation: "true",
        addRecipeNutrition: "true",
        apiKey: process.env.SPOONACULAR_API_KEY!,
      });
      const res = await fetch(
        `https://api.spoonacular.com/recipes/complexSearch?${params}`
      );
      if (!res.ok) {
        const text = await res.text();
        return { error: `Spoonacular API error (${res.status}): ${text.slice(0, 200)}` };
      }
      const data = await res.json();
      // Simplify the response for the LLM
      if (data.results) {
        return {
          results: data.results.map((r: any) => ({
            id: String(r.id),
            title: r.title,
            image: r.image,
            readyInMinutes: r.readyInMinutes,
            servings: r.servings,
            sourceUrl: r.sourceUrl,
            calories: r.nutrition?.nutrients?.find((n: any) => n.name === "Calories")?.amount,
            protein: r.nutrition?.nutrients?.find((n: any) => n.name === "Protein")?.amount,
            carbs: r.nutrition?.nutrients?.find((n: any) => n.name === "Carbohydrates")?.amount,
            fat: r.nutrition?.nutrients?.find((n: any) => n.name === "Fat")?.amount,
            ingredients: r.nutrition?.ingredients?.map((i: any) => ({
              name: i.name,
              amount: i.amount,
              unit: i.unit,
            })) || [],
          })),
          totalResults: data.totalResults,
        };
      }
      return data;
    },

    get_recipe_details: async (args: any) => {
      const res = await fetch(
        `https://api.spoonacular.com/recipes/${args.recipeId}/information?includeNutrition=true&apiKey=${process.env.SPOONACULAR_API_KEY}`
      );
      if (!res.ok) {
        const text = await res.text();
        return { error: `Spoonacular API error (${res.status}): ${text.slice(0, 200)}` };
      }
      const data = await res.json();
      return {
        id: String(data.id),
        title: data.title,
        image: data.image,
        readyInMinutes: data.readyInMinutes,
        servings: data.servings,
        sourceUrl: data.sourceUrl,
        calories: data.nutrition?.nutrients?.find((n: any) => n.name === "Calories")?.amount,
        protein: data.nutrition?.nutrients?.find((n: any) => n.name === "Protein")?.amount,
        carbs: data.nutrition?.nutrients?.find((n: any) => n.name === "Carbohydrates")?.amount,
        fat: data.nutrition?.nutrients?.find((n: any) => n.name === "Fat")?.amount,
        ingredients: data.extendedIngredients?.map((i: any) => ({
          name: i.name,
          amount: i.amount,
          unit: i.unit,
        })) || [],
      };
    },

    // ═══════════════════════════════════════════
    // MEMORY HANDLERS — SuperMemory
    // ═══════════════════════════════════════════

    store_memory: async (args: any) => {
      if (!supermemory) {
        return { id: null, status: "skipped", message: "Memory storage unavailable." };
      }
      const userId = await getUserId();
      const result = await supermemory.add({
        content: args.content,
        containerTag: containerTag(userId),
        metadata: {
          category: args.category,
          source: "conversation",
        },
      });
      return {
        id: result.id,
        status: result.status,
        message: `Memory stored: "${args.content}"`,
      };
    },

    recall_memories: async (args: any) => {
      if (!supermemory) {
        return { memories: [], total: 0, timing: {} };
      }
      const userId = await getUserId();
      const result = await supermemory.search.memories({
        q: args.query,
        containerTag: containerTag(userId),
        limit: args.limit || 10,
      });
      return {
        memories: result.results.map((r: any) => ({
          id: r.id,
          content: r.memory || r.chunk || "",
          similarity: r.similarity,
          category: (r.metadata as any)?.category || "unknown",
          updatedAt: r.updatedAt,
        })),
        total: result.total,
        timing: result.timing,
      };
    },

    get_taste_profile: async (args: any) => {
      if (!supermemory) {
        return { staticTraits: [], dynamicTraits: [] };
      }
      const userId = await getUserId();
      const result = await supermemory.profile({
        containerTag: containerTag(userId),
        ...(args.context && { q: args.context }),
      });
      return {
        staticTraits: result.profile.static,
        dynamicTraits: result.profile.dynamic,
        ...(result.searchResults && {
          contextualResults: {
            results: result.searchResults.results,
            total: result.searchResults.total,
          },
        }),
      };
    },

    // ═══════════════════════════════════════════
    // TIKTOK & CUSTOM RECIPE HANDLERS
    // ═══════════════════════════════════════════

    extract_tiktok_recipe: async (args: any) => {
      try {
        const res = await fetch(
          `${process.env.SITE_URL || "http://localhost:3005"}/api/tiktok-extract`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoUrl: args.videoUrl }),
          }
        );
        const data = await res.json();
        if (!res.ok) {
          return { success: false, error: data.error || "TikTok extraction failed." };
        }
        return data;
      } catch (error: any) {
        return { success: false, error: `TikTok extraction request failed: ${error.message}` };
      }
    },

    save_custom_recipe: async (args: any) => {
      const result = await convex.mutation(api.customRecipes.save, {
        name: args.name,
        source: args.source,
        sourceUrl: args.sourceUrl,
        creator: args.creator,
        ingredients: args.ingredients,
        instructions: args.instructions,
        calories: args.calories,
        protein: args.protein,
        carbs: args.carbs,
        fat: args.fat,
      });
      return { ...result, name: args.name };
    },

    search_custom_recipes: async (args: any) => {
      const results = await convex.query(api.customRecipes.getByName, {
        query: args.query,
      });
      return { recipes: results, total: results.length };
    },

    // ═══════════════════════════════════════════
    // INTAKE FLOW
    // ═══════════════════════════════════════════

    intake_complete: async () => {
      return { success: true, message: "Intake complete." };
    },

    // ═══════════════════════════════════════════
    // ORDERING HANDLERS — Browser Use Agent Integration
    // Log to Convex + trigger Browser Use agent (FUTURE)
    // ═══════════════════════════════════════════

    initiate_doordash_order: async (args: any) => {
      const { eventId } = await convex.mutation(api.orderEvents.create, {
        mealPlanId: args.mealPlanId,
        plannedMealId: args.plannedMealId,
        service: "doordash",
        action: "initiated",
        details: JSON.stringify({
          recipeName: args.recipeName,
          deliveryAddress: args.deliveryAddress,
        }),
      });

      // Trigger Browser Use agent
      try {
        const doordashRes = await fetch(`${process.env.SITE_URL || "http://localhost:3005"}/api/doordash`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ searchIntent: args.recipeName }),
        });
        const doordashResult = await doordashRes.json();

        // Log confirmed event
        await convex.mutation(api.orderEvents.create, {
          mealPlanId: args.mealPlanId,
          plannedMealId: args.plannedMealId,
          service: "doordash",
          action: "confirmed",
          details: JSON.stringify(doordashResult),
        });

        return {
          eventId,
          status: "confirmed",
          message: `DoorDash order placed for "${args.recipeName}".`,
          result: doordashResult,
        };
      } catch (error: any) {
        return {
          eventId,
          status: "initiated",
          message: `DoorDash order logged but Browser Use agent could not be reached: ${error.message}. You can retry later.`,
        };
      }
    },

    initiate_instacart_order: async (args: any) => {
      const groceryList = await convex.query(api.groceryList.get, {
        mealPlanId: args.mealPlanId,
      });
      const items = groceryList?.items ?? [];
      const { eventId } = await convex.mutation(api.orderEvents.create, {
        mealPlanId: args.mealPlanId,
        service: "instacart",
        action: "initiated",
        details: JSON.stringify({
          deliveryAddress: args.deliveryAddress,
          itemCount: items.length,
        }),
      });

      if (items.length === 0) {
        return {
          eventId,
          status: "initiated",
          message: "Grocery list is empty. Generate a meal plan and grocery list first.",
        };
      }

      try {
        const instacartRes = await fetch(
          `${process.env.SITE_URL || "http://localhost:3005"}/api/instacart`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: items.map((i: { name: string; amount?: number; unit?: string }) => ({
                name: i.name,
                amount: i.amount,
                unit: i.unit,
              })),
            }),
          }
        );
        const instacartResult = await instacartRes.json();

        if (!instacartRes.ok) {
          return {
            eventId,
            status: "initiated",
            message: `Instacart agent failed: ${instacartResult.error || instacartRes.statusText}. Check docs/INSTACART_SETUP.md.`,
          };
        }

        await convex.mutation(api.orderEvents.create, {
          mealPlanId: args.mealPlanId,
          service: "instacart",
          action: "confirmed",
          details: JSON.stringify(instacartResult),
        });

        return {
          eventId,
          status: "confirmed",
          message: `Added ${items.length} items to Instacart cart. ${instacartResult.output || ""}`,
          result: instacartResult,
        };
      } catch (error: any) {
        return {
          eventId,
          status: "initiated",
          message: `Instacart order logged but Browser Use agent could not be reached: ${error.message}. You can retry from the grocery list.`,
        };
      }
    },

    initiate_opentable_reservation: async (args: any) => {
      const { eventId } = await convex.mutation(api.orderEvents.create, {
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

      try {
        const opentableRes = await fetch(
          `${process.env.SITE_URL || "http://localhost:3005"}/api/opentable`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              restaurantName: args.cuisine,
              location: args.location || "San Francisco",
              date: args.date,
              time: args.time || "19:00",
              partySize: args.partySize ?? 2,
            }),
          }
        );
        const opentableResult = await opentableRes.json();

        if (!opentableRes.ok) {
          return {
            eventId,
            status: "initiated",
            message: `OpenTable agent failed: ${opentableResult.error || opentableResult.details || opentableRes.statusText}. Log into OpenTable in Chrome and sync your profile.`,
          };
        }

        await convex.mutation(api.orderEvents.create, {
          mealPlanId: args.mealPlanId,
          service: "opentable",
          action: "confirmed",
          details: JSON.stringify(opentableResult),
        });

        return {
          eventId,
          status: "confirmed",
          message: `OpenTable reservation confirmed. ${opentableResult.output || ""}`,
          result: opentableResult,
        };
      } catch (error: any) {
        return {
          eventId,
          status: "initiated",
          message: `OpenTable reservation logged but Browser Use agent could not be reached: ${error.message}. You can retry from the meal plan.`,
        };
      }
    },
  };

  return handlers;
}
