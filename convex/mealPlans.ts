import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    weekStartDate: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    // Archive ALL other active plans for this user (enforce single active plan)
    const activePlans = await ctx.db
      .query("mealPlans")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", userId).eq("status", "active")
      )
      .collect();

    // Check for existing plan for this specific week
    const existing = await ctx.db
      .query("mealPlans")
      .withIndex("by_userId_week", (q) =>
        q.eq("userId", userId).eq("weekStartDate", args.weekStartDate)
      )
      .first();
    if (existing) {
      // Archive every other active plan that isn't this one
      for (const plan of activePlans) {
        if (plan._id !== existing._id) {
          await ctx.db.patch(plan._id, { status: "archived" });
        }
      }
      // Reactivate this plan if it was archived
      if (existing.status !== "active") {
        await ctx.db.patch(existing._id, { status: "active" });
      }
      return { mealPlanId: existing._id, existing: true };
    }

    // No existing plan for this week — archive all active plans and create new
    for (const plan of activePlans) {
      await ctx.db.patch(plan._id, { status: "archived" });
    }
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

// One-time cleanup: archive all but the newest active plan for a user
export const archiveStale = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const activePlans = await ctx.db
      .query("mealPlans")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", userId).eq("status", "active")
      )
      .order("desc")
      .collect();
    if (activePlans.length <= 1) return { archived: 0 };
    // Keep the first (newest), archive the rest
    let archived = 0;
    for (let i = 1; i < activePlans.length; i++) {
      await ctx.db.patch(activePlans[i]._id, { status: "archived" });
      archived++;
    }
    return { archived, keptPlanId: activePlans[0]._id };
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
    isTakeout: v.optional(v.boolean()),
    takeoutService: v.optional(v.string()),
    takeoutDetails: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const plan = await ctx.db.get(args.mealPlanId);
    if (!plan || plan.userId !== userId) throw new Error("Not authorized");

    // Normalize: default isTakeout to false so patch always writes a real value
    // (ctx.db.patch strips undefined, which would leave stale isTakeout=true)
    const isTakeout = args.isTakeout ?? false;
    const takeoutService = isTakeout ? args.takeoutService : undefined;
    const takeoutDetails = isTakeout ? args.takeoutDetails : undefined;

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
        ingredients: isTakeout ? undefined : args.ingredients,
        isManualOverride: args.isManualOverride,
        isSkipped: false,
        isTakeout,
        takeoutService,
        takeoutDetails,
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
      ingredients: isTakeout ? undefined : args.ingredients,
      isManualOverride: args.isManualOverride,
      isTakeout,
      takeoutService,
      takeoutDetails,
    });
    return { mealId: id, updated: false };
  },
});

export const getMealsByPlanId = query({
  args: {
    mealPlanId: v.id("mealPlans"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const plan = await ctx.db.get(args.mealPlanId);
    if (!plan || plan.userId !== userId) throw new Error("Not authorized");
    return await ctx.db
      .query("plannedMeals")
      .withIndex("by_mealPlanId", (q) => q.eq("mealPlanId", args.mealPlanId))
      .collect();
  },
});

export const batchUpsertMeals = mutation({
  args: {
    mealPlanId: v.id("mealPlans"),
    meals: v.array(
      v.object({
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
        isTakeout: v.optional(v.boolean()),
        takeoutService: v.optional(v.string()),
        takeoutDetails: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const plan = await ctx.db.get(args.mealPlanId);
    if (!plan || plan.userId !== userId) throw new Error("Not authorized");

    const results = [];
    for (const meal of args.meals) {
      const existing = await ctx.db
        .query("plannedMeals")
        .withIndex("by_mealPlanId_day_mealType", (q) =>
          q
            .eq("mealPlanId", args.mealPlanId)
            .eq("day", meal.day)
            .eq("mealType", meal.mealType)
        )
        .first();

      const isTakeout = meal.isTakeout ?? false;
      const takeoutService = isTakeout ? (meal.takeoutService ?? "doordash") : undefined;
      const takeoutDetails = isTakeout ? meal.takeoutDetails : undefined;

      if (existing) {
        await ctx.db.patch(existing._id, {
          recipeId: meal.recipeId,
          recipeName: meal.recipeName,
          recipeImageUrl: meal.recipeImageUrl,
          sourceUrl: meal.sourceUrl,
          calories: meal.calories,
          protein: meal.protein,
          carbs: meal.carbs,
          fat: meal.fat,
          ingredients: isTakeout ? undefined : meal.ingredients,
          isManualOverride: false,
          isSkipped: false,
          isTakeout,
          takeoutService,
          takeoutDetails,
        });
        results.push({ day: meal.day, mealType: meal.mealType, updated: true });
      } else {
        await ctx.db.insert("plannedMeals", {
          mealPlanId: args.mealPlanId,
          userId,
          day: meal.day,
          mealType: meal.mealType,
          recipeId: meal.recipeId,
          recipeName: meal.recipeName,
          recipeImageUrl: meal.recipeImageUrl,
          sourceUrl: meal.sourceUrl,
          calories: meal.calories,
          protein: meal.protein,
          carbs: meal.carbs,
          fat: meal.fat,
          ingredients: isTakeout ? undefined : meal.ingredients,
          isManualOverride: false,
          isTakeout,
          takeoutService,
          takeoutDetails,
        });
        results.push({ day: meal.day, mealType: meal.mealType, updated: false });
      }
    }
    return { success: true, mealsWritten: results.length, results };
  },
});

/** Returns active meal plan IDs (for running seedDineOutSlots). Use: npx convex run mealPlans:listActivePlanIds */
export const listActivePlanIds = query({
  args: {},
  handler: async (ctx) => {
    const plans = await ctx.db.query("mealPlans").collect();
    return plans
      .filter((p) => p.status === "active")
      .map((p) => ({ id: p._id, weekStartDate: p.weekStartDate }));
  },
});

/** List users (for finding email). Run: npx convex run mealPlans:listUsers */
export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({ id: u._id, email: (u as { email?: string }).email, name: (u as { name?: string }).name }));
  },
});

/** Wipe all meal plans for a user by email. Run: npx convex run mealPlans:wipeMealPlansForEmail '{"email":"user@example.com"}' */
export const wipeMealPlansForEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();
    const emailLower = args.email.toLowerCase().trim();
    const user = users.find((u) => {
      const e = (u as { email?: string }).email;
      return e && e.toLowerCase().trim() === emailLower;
    });
    if (!user) throw new Error(`User not found: ${args.email}. Use mealPlans:listUsers to see available emails.`);
    const userId = user._id;

    const allPlans = await ctx.db
      .query("mealPlans")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();

    let deletedMeals = 0;
    let deletedGrocery = 0;
    let deletedOrders = 0;
    let deletedPlans = 0;

    for (const plan of allPlans) {
      const meals = await ctx.db
        .query("plannedMeals")
        .withIndex("by_mealPlanId", (q) => q.eq("mealPlanId", plan._id))
        .collect();
      for (const m of meals) {
        await ctx.db.delete(m._id);
        deletedMeals++;
      }
      const grocery = await ctx.db
        .query("groceryLists")
        .withIndex("by_mealPlanId", (q) => q.eq("mealPlanId", plan._id))
        .first();
      if (grocery) {
        await ctx.db.delete(grocery._id);
        deletedGrocery++;
      }
      const orders = await ctx.db
        .query("orderEvents")
        .withIndex("by_mealPlanId", (q) => q.eq("mealPlanId", plan._id))
        .collect();
      for (const o of orders) {
        await ctx.db.delete(o._id);
        deletedOrders++;
      }
      await ctx.db.delete(plan._id);
      deletedPlans++;
    }

    return {
      success: true,
      message: `Wiped ${deletedPlans} meal plans, ${deletedMeals} meals, ${deletedGrocery} grocery lists, ${deletedOrders} order events for ${args.email}`,
    };
  },
});

/** One-time seed: add Friday and Saturday dinner as OpenTable slots. Run: npx convex run mealPlans:seedDineOutSlots '{"mealPlanId":"<id>"}' */
export const seedDineOutSlots = mutation({
  args: { mealPlanId: v.id("mealPlans") },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.mealPlanId);
    if (!plan) throw new Error("Plan not found");
    const userId = plan.userId;
    const slots = [
      { day: "friday", mealType: "dinner", recipeName: "House of Prime Rib" },
      { day: "saturday", mealType: "dinner", recipeName: "Kokkari Estiatorio" },
    ];
    for (const slot of slots) {
      const existing = await ctx.db
        .query("plannedMeals")
        .withIndex("by_mealPlanId_day_mealType", (q) =>
          q.eq("mealPlanId", args.mealPlanId).eq("day", slot.day).eq("mealType", slot.mealType)
        )
        .first();
      const patchFields = {
        recipeId: "dineout-opentable",
        recipeName: slot.recipeName,
        isManualOverride: true,
        isSkipped: false,
        isTakeout: true,
        takeoutService: "opentable",
        takeoutDetails: "19:00",
      };
      if (existing) {
        await ctx.db.patch(existing._id, patchFields);
      } else {
        await ctx.db.insert("plannedMeals", {
          mealPlanId: args.mealPlanId,
          userId,
          day: slot.day,
          mealType: slot.mealType,
          ...patchFields,
        });
      }
    }
    return { success: true, message: "Added Friday and Saturday dinner as OpenTable" };
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
