import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db.get(userId);
  },
});

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("preferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const createDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const existing = await ctx.db
      .query("preferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("preferences", {
      userId,
      dietaryRestrictions: [],
      allergies: [],
      cuisinePreferences: [],
      excludedIngredients: [],
      mealSlots: ["breakfast", "lunch", "dinner"],
      householdSize: 1,
    });
  },
});

/** Clear takeout/dine-out preferences for a user by email. Run: npx convex run preferences:clearTakeoutForEmail '{"email":"user@example.com"}' */
export const clearTakeoutForEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();
    const emailLower = args.email.toLowerCase().trim();
    const user = users.find((u) => {
      const e = (u as { email?: string }).email;
      return e && e.toLowerCase().trim() === emailLower;
    });
    if (!user) throw new Error(`User not found: ${args.email}`);
    const prefs = await ctx.db
      .query("preferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!prefs) return { success: true, message: "No preferences found" };
    await ctx.db.patch(prefs._id, { takeoutDays: [], takeoutSlots: [], dineoutDays: [], dineoutSlots: [] });
    return { success: true, message: "Cleared takeoutDays, takeoutSlots, dineoutDays, and dineoutSlots" };
  },
});

export const update = mutation({
  args: {
    dietaryRestrictions: v.optional(v.array(v.string())),
    allergies: v.optional(v.array(v.string())),
    cuisinePreferences: v.optional(v.array(v.string())),
    excludedIngredients: v.optional(v.array(v.string())),
    calorieTarget: v.optional(v.number()),
    proteinTargetGrams: v.optional(v.number()),
    carbTargetGrams: v.optional(v.number()),
    fatTargetGrams: v.optional(v.number()),
    householdSize: v.optional(v.number()),
    budgetPerWeek: v.optional(v.number()),
    mealSlots: v.optional(v.array(v.string())),
    preferredOrderMethod: v.optional(v.string()),
    deliveryAddress: v.optional(v.string()),
    takeoutDays: v.optional(v.array(v.string())),
    takeoutSlots: v.optional(v.array(v.string())),
    dineoutDays: v.optional(v.array(v.string())),
    dineoutSlots: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    let prefs = await ctx.db
      .query("preferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!prefs) {
      const id = await ctx.db.insert("preferences", {
        userId,
        ...args,
      });
      return { success: true, id };
    }
    const updates: Record<string, any> = {};
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }
    await ctx.db.patch(prefs._id, updates);
    return { success: true, id: prefs._id };
  },
});
