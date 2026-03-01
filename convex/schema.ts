import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const schema = defineSchema({
  ...authTables,

  preferences: defineTable({
    userId: v.id("users"),
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
  }).index("by_userId", ["userId"]),

  mealPlans: defineTable({
    userId: v.id("users"),
    weekStartDate: v.string(),
    status: v.string(),
  })
    .index("by_userId_week", ["userId", "weekStartDate"])
    .index("by_userId_status", ["userId", "status"]),

  plannedMeals: defineTable({
    mealPlanId: v.id("mealPlans"),
    userId: v.id("users"),
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
    isSkipped: v.optional(v.boolean()),
    isTakeout: v.optional(v.boolean()),
    takeoutService: v.optional(v.string()),
    takeoutDetails: v.optional(v.string()),
  })
    .index("by_mealPlanId", ["mealPlanId"])
    .index("by_mealPlanId_day_mealType", ["mealPlanId", "day", "mealType"]),

  groceryLists: defineTable({
    mealPlanId: v.id("mealPlans"),
    userId: v.id("users"),
    items: v.array(
      v.object({
        name: v.string(),
        amount: v.number(),
        unit: v.string(),
      })
    ),
  }).index("by_mealPlanId", ["mealPlanId"]),

  orderEvents: defineTable({
    userId: v.id("users"),
    mealPlanId: v.id("mealPlans"),
    plannedMealId: v.optional(v.id("plannedMeals")),
    service: v.string(),
    action: v.string(),
    details: v.string(),
  })
    .index("by_mealPlanId", ["mealPlanId"])
    .index("by_userId", ["userId"]),
});

export default schema;
