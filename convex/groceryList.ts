import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const generate = mutation({
  args: {
    mealPlanId: v.id("mealPlans"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    // Get all non-skipped meals for this plan
    const meals = await ctx.db
      .query("plannedMeals")
      .withIndex("by_mealPlanId", (q) => q.eq("mealPlanId", args.mealPlanId))
      .collect();
    // Consolidate ingredients
    const ingredientMap = new Map<string, { amount: number; unit: string }>();
    for (const meal of meals) {
      if (meal.isSkipped) continue;
      if (!meal.ingredients) continue;
      for (const ing of meal.ingredients) {
        const key = `${ing.name.toLowerCase()}|${ing.unit.toLowerCase()}`;
        const existing = ingredientMap.get(key);
        if (existing) {
          existing.amount += ing.amount;
        } else {
          ingredientMap.set(key, { amount: ing.amount, unit: ing.unit });
        }
      }
    }
    const items = Array.from(ingredientMap.entries()).map(([key, val]) => ({
      name: key.split("|")[0],
      amount: Math.round(val.amount * 100) / 100,
      unit: val.unit,
    }));
    // Upsert grocery list
    const existing = await ctx.db
      .query("groceryLists")
      .withIndex("by_mealPlanId", (q) => q.eq("mealPlanId", args.mealPlanId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { items });
      return { groceryListId: existing._id, itemCount: items.length };
    }
    const id = await ctx.db.insert("groceryLists", {
      mealPlanId: args.mealPlanId,
      userId,
      items,
    });
    return { groceryListId: id, itemCount: items.length };
  },
});

export const get = query({
  args: {
    mealPlanId: v.id("mealPlans"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const result = await ctx.db
      .query("groceryLists")
      .withIndex("by_mealPlanId", (q) => q.eq("mealPlanId", args.mealPlanId))
      .first();
    if (!result || result.userId !== userId) return null;
    return result;
  },
});
