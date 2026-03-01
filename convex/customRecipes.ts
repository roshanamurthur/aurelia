import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const save = mutation({
  args: {
    name: v.string(),
    source: v.string(),
    sourceUrl: v.optional(v.string()),
    creator: v.optional(v.string()),
    ingredients: v.optional(
      v.array(
        v.object({
          name: v.string(),
          amount: v.number(),
          unit: v.string(),
        })
      )
    ),
    instructions: v.optional(v.string()),
    calories: v.optional(v.number()),
    protein: v.optional(v.number()),
    carbs: v.optional(v.number()),
    fat: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const id = await ctx.db.insert("customRecipes", {
      userId,
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
      imageUrl: args.imageUrl,
    });
    return { recipeId: id };
  },
});

export const getByName = query({
  args: {
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const all = await ctx.db
      .query("customRecipes")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const search = args.query.toLowerCase();
    return all.filter((r) => r.name.toLowerCase().includes(search));
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("customRecipes")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});
