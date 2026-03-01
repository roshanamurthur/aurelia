import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const create = mutation({
  args: {
    weekStartDate: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    // Check for existing plan
    const existing = await ctx.db
      .query("mealPlans")
      .withIndex("by_userId_week", (q) =>
        q.eq("userId", userId).eq("weekStartDate", args.weekStartDate)
      )
      .first();
    if (existing) return { mealPlanId: existing._id, existing: true };
    const id = await ctx.db.insert("mealPlans", {
      userId,
      weekStartDate: args.weekStartDate,
      status: "active",
    });
    return { mealPlanId: id, existing: false };
  },
});

export const getWithMeals = query({
  args: {
    weekStartDate: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const plan = await ctx.db
      .query("mealPlans")
      .withIndex("by_userId_week", (q) =>
        q.eq("userId", userId).eq("weekStartDate", args.weekStartDate)
      )
      .first();
    if (!plan) return null;
    const meals = await ctx.db
      .query("plannedMeals")
      .withIndex("by_mealPlanId", (q) => q.eq("mealPlanId", plan._id))
      .collect();
    return { ...plan, meals };
  },
});

export const getActivePlan = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const plan = await ctx.db
      .query("mealPlans")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", userId).eq("status", "active")
      )
      .order("desc")
      .first();
    if (!plan) return null;
    const meals = await ctx.db
      .query("plannedMeals")
      .withIndex("by_mealPlanId", (q) => q.eq("mealPlanId", plan._id))
      .collect();
    return { ...plan, meals };
  },
});

export const upsertMeal = mutation({
  args: {
    mealPlanId: v.id("mealPlans"),
    day: v.string(),
    mealType: v.string(),
    recipeId: v.string(),
    recipeName: v.string(),
    recipeImageUrl: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    calories: v.optional(v.number()),
    protein: v.optional(v.number()),
    carbs: v.optional(v.number()),
    fat: v.optional(v.number()),
    ingredients: v.optional(
      v.array(
        v.object({
          name: v.string(),
          amount: v.number(),
          unit: v.string(),
        })
      )
    ),
    isManualOverride: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const plan = await ctx.db.get(args.mealPlanId);
    if (!plan || plan.userId !== userId) throw new Error("Not authorized");
    // Check if meal already exists for this slot
    const existing = await ctx.db
      .query("plannedMeals")
      .withIndex("by_mealPlanId_day_mealType", (q) =>
        q
          .eq("mealPlanId", args.mealPlanId)
          .eq("day", args.day)
          .eq("mealType", args.mealType)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        recipeId: args.recipeId,
        recipeName: args.recipeName,
        recipeImageUrl: args.recipeImageUrl,
        sourceUrl: args.sourceUrl,
        calories: args.calories,
        protein: args.protein,
        carbs: args.carbs,
        fat: args.fat,
        ingredients: args.ingredients,
        isManualOverride: args.isManualOverride,
        isSkipped: false,
      });
      return { mealId: existing._id, updated: true };
    }
    const id = await ctx.db.insert("plannedMeals", {
      mealPlanId: args.mealPlanId,
      userId,
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
      ingredients: args.ingredients,
      isManualOverride: args.isManualOverride,
    });
    return { mealId: id, updated: false };
  },
});

export const skipMeal = mutation({
  args: {
    mealPlanId: v.id("mealPlans"),
    day: v.string(),
    mealType: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const plan = await ctx.db.get(args.mealPlanId);
    if (!plan || plan.userId !== userId) throw new Error("Not authorized");
    const existing = await ctx.db
      .query("plannedMeals")
      .withIndex("by_mealPlanId_day_mealType", (q) =>
        q
          .eq("mealPlanId", args.mealPlanId)
          .eq("day", args.day)
          .eq("mealType", args.mealType)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { isSkipped: true });
      return { success: true };
    }
    return { success: false, error: "Meal not found" };
  },
});
