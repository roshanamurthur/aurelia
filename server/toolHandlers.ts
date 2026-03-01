// server/toolHandlers.ts
//
// Each key matches a tool name in toolDefinitions.ts.
// Three categories:
// 1. CONVEX HANDLERS — read/write to Convex (auth via forwarded token)
// 2. EXTERNAL API HANDLERS — call Spoonacular
// 3. ORDERING HANDLERS — log to Convex + trigger Browser Use agent (future)

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import Supermemory from "supermemory";

export function createToolHandlers(authToken: string) {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  convex.setAuth(authToken);

  const supermemory = new Supermemory({
    apiKey: process.env.SUPERMEMORY_API_KEY,
  });

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

      return await convex.mutation(api.mealPlans.upsertMeal, {
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
        sort: "random",
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
      const userId = await getUserId();
      const result = await supermemory.search.memories({
        q: args.query,
        containerTag: containerTag(userId),
        limit: args.limit || 10,
      });
      return {
        memories: result.results.map((r) => ({
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
