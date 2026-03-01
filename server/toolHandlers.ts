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

    create_meal_plan: async (args: any) => {
      return await convex.mutation(api.mealPlans.create, {
        weekStartDate: args.weekStartDate,
      });
    },

    get_meal_plan: async (args: any) => {
      return await convex.query(api.mealPlans.getWithMeals, {
        weekStartDate: args.weekStartDate,
      });
    },

    update_meal: async (args: any) => {
      let ingredients = args.ingredients;

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

      // For takeout meals, clear ingredients
      if (args.isTakeout) {
        ingredients = undefined;
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
        calories: args.calories,
        protein: args.protein,
        carbs: args.carbs,
        fat: args.fat,
        ingredients,
        isManualOverride: args.isManualOverride ?? false,
        isTakeout: args.isTakeout,
        takeoutService: args.takeoutService,
        takeoutDetails: args.takeoutDetails,
      });
      if (duplicateWarning) {
        return { ...result, duplicateWarning };
      }
      return result;
    },

    populate_meal_plan: async (args: any) => {
      const { mealPlanId, days, mealSlots, excludeRecipeIds = [] } = args;

      // Build Spoonacular base params from dietary constraints
      const baseParams: Record<string, string> = {
        addRecipeInformation: "true",
        addRecipeNutrition: "true",
        sort: "popularity",
        apiKey: process.env.SPOONACULAR_API_KEY!,
      };
      if (args.diet) baseParams.diet = args.diet;
      if (args.intolerances) baseParams.intolerances = args.intolerances;
      if (args.cuisine) baseParams.cuisine = args.cuisine;
      if (args.excludeIngredients) baseParams.excludeIngredients = args.excludeIngredients;
      if (args.maxCalories) baseParams.maxCalories = String(args.maxCalories);

      // Map meal slots to Spoonacular types
      const spoonacularType: Record<string, string> = {
        breakfast: "breakfast",
        lunch: "main course",
        dinner: "main course",
        snack: "snack",
      };

      // Search Spoonacular: 2 calls per meal type (offset 0 and 15), all in parallel
      const uniqueSlots = [...new Set(mealSlots as string[])];
      const searchPromises = uniqueSlots.flatMap((slot) => {
        const type = spoonacularType[slot] || "main course";
        return [0, 15].map(async (offset) => {
          const params = new URLSearchParams({
            ...baseParams,
            type,
            number: "15",
            offset: String(offset),
          });
          try {
            const res = await fetch(
              `https://api.spoonacular.com/recipes/complexSearch?${params}`
            );
            if (!res.ok) return [];
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
          } catch {
            return [];
          }
        });
      });

      const searchResults = await Promise.all(searchPromises);

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

      // Assign recipes to slots
      const meals: any[] = [];
      const typeIndex: Record<string, number> = {};
      for (const slot of uniqueSlots) {
        typeIndex[slot] = 0;
      }

      for (const day of days as string[]) {
        for (const slot of mealSlots as string[]) {
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
      const totalSlots = (days as string[]).length * (mealSlots as string[]).length;
      let batchResult = null;
      if (meals.length > 0) {
        batchResult = await convex.mutation(api.mealPlans.batchUpsertMeals, {
          mealPlanId,
          meals,
        });

        // Auto-generate grocery list
        try {
          await convex.mutation(api.groceryList.generate, { mealPlanId });
        } catch {
          // Non-fatal
        }
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
          note: `Only ${meals.length} of ${totalSlots} slots filled. Spoonacular returned limited results for the given constraints. You can use search_recipes + update_meal to fill remaining slots manually.`,
        }),
        groceryListGenerated: meals.length > 0,
      };
    },

    remove_meal: async (args: any) => {
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
      const { eventId } = await convex.mutation(api.orderEvents.create, {
        mealPlanId: args.mealPlanId,
        service: "instacart",
        action: "initiated",
        details: JSON.stringify({
          deliveryAddress: args.deliveryAddress,
          itemCount: groceryList?.items?.length || 0,
        }),
      });
      // TODO: Trigger Browser Use agent here
      return {
        eventId,
        status: "initiated",
        message: "Instacart order initiated. Browser Use agent integration pending.",
      };
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
      // TODO: Trigger Browser Use agent here
      return {
        eventId,
        status: "initiated",
        message: "OpenTable reservation initiated. Browser Use agent integration pending.",
      };
    },
  };

  return handlers;
}
