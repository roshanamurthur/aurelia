import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const create = mutation({
  args: {
    mealPlanId: v.id("mealPlans"),
    plannedMealId: v.optional(v.id("plannedMeals")),
    service: v.string(),
    action: v.string(),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const id = await ctx.db.insert("orderEvents", {
      userId,
      mealPlanId: args.mealPlanId,
      plannedMealId: args.plannedMealId,
      service: args.service,
      action: args.action,
      details: args.details,
    });
    return { eventId: id };
  },
});

export const getByPlan = query({
  args: {
    mealPlanId: v.id("mealPlans"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const events = await ctx.db
      .query("orderEvents")
      .withIndex("by_mealPlanId", (q) => q.eq("mealPlanId", args.mealPlanId))
      .collect();
    return events.filter((event) => event.userId === userId);
  },
});
