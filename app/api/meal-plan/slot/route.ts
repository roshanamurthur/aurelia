import { connectDB } from "@/lib/mongodb";
import {
  fetchSlotRecipes,
  resolveSlot,
  computeDayNutrition,
  computeSlotBudgets,
  defaultMealTypes,
} from "@/lib/planning-engine";
import type {
  MealSlot,
  MealType,
  SavedMealPlan,
  UserPreferences,
} from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = (body.userId as string | undefined)?.trim() || "demo";
    const weekStart = body.weekStart as string | undefined;
    const date = body.date as string | undefined;
    const slotIndex = typeof body.slotIndex === "number" ? body.slotIndex : undefined;

    if (!weekStart || !date || slotIndex === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: weekStart, date, slotIndex" },
        { status: 400 }
      );
    }

    const apiKey = process.env.SPOONACULAR_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "SPOONACULAR_API_KEY is not configured" }, { status: 500 });
    }

    const db = await connectDB();
    const prefs = await db.collection<UserPreferences>("user_preferences").findOne({ userId });
    const savedPlan = await db.collection<SavedMealPlan>("meal_plans").findOne({
      userId,
      weekStart,
      status: "active",
    });

    if (!savedPlan) {
      return NextResponse.json({ error: "No active plan found for this week" }, { status: 404 });
    }

    const dayIndex = savedPlan.days.findIndex((d) => d.date === date);
    if (dayIndex === -1) {
      return NextResponse.json({ error: "Date not found in plan" }, { status: 404 });
    }

    const day = savedPlan.days[dayIndex];
    const slot = day.meals[slotIndex];
    if (!slot) {
      return NextResponse.json({ error: "Slot index out of range" }, { status: 404 });
    }

    if (slot.isTakeout) {
      return NextResponse.json({ error: "Cannot swap a takeout slot" }, { status: 400 });
    }

    const defaultPrefs: UserPreferences = {
      userId,
      excludeIngredients: [],
      preferredCuisines: [],
      excludeCuisine: [],
      diet: "",
      intolerances: [],
      calorieRange: { min: 0, max: 0 },
      proteinTarget: 0,
      carbRange: { min: 0, max: 999 },
      fatRange: { min: 0, max: 999 },
      sodiumRange: { min: 0, max: 9999 },
      sugarRange: { min: 0, max: 999 },
      maxReadyTime: 0,
      mealTypes: [],
      equipment: [],
      servingRange: { min: 0, max: 0 },
      query: "",
      sortPreference: "",
      sortDirection: "asc",
      takeoutDays: [],
      swapHistory: [],
      dailyCalorieTarget: 2000,
      dailyProteinTarget: 0,
      dailyCarbTarget: 0,
      dailyFatTarget: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const effectivePrefs: UserPreferences = prefs
      ? { ...defaultPrefs, ...prefs, dailyCalorieTarget: prefs.dailyCalorieTarget > 0 ? prefs.dailyCalorieTarget : 2000 }
      : defaultPrefs;

    const mealTypes = savedPlan.config.mealTypes?.length
      ? savedPlan.config.mealTypes
      : defaultMealTypes(savedPlan.config.mealsPerDay);

    const budgets = computeSlotBudgets(
      effectivePrefs.dailyCalorieTarget > 0 ? effectivePrefs.dailyCalorieTarget : 2000,
      mealTypes,
    );

    // Fetch fresh recipes for this slot's meal type
    const newRecipes = await fetchSlotRecipes(
      slot.mealType,
      budgets[slot.mealType] ?? slot.calorieTarget,
      effectivePrefs,
      apiKey,
      10,
      Math.floor(Math.random() * 80),
    );

    // Exclude currently used recipe ids to avoid same pick
    const currentIds = new Set(
      day.meals.filter((m) => m.recipe).map((m) => m.recipe!.id)
    );

    const newPool = new Map<MealType, typeof newRecipes>();
    newPool.set(slot.mealType, newRecipes);
    // Remove current slot's recipe id from used ids so it won't be reused, but exclude other meals
    const usedIds = new Set(currentIds);
    if (slot.recipe) usedIds.delete(slot.recipe.id); // allow re-fetch but prefer new

    const updatedSlot = await resolveSlot(
      { ...slot },
      effectivePrefs,
      newPool,
      usedIds,
    );

    // Update the plan in MongoDB
    const updatedMeals = [...day.meals];
    updatedMeals[slotIndex] = updatedSlot;
    const updatedNutrition = computeDayNutrition(updatedMeals);

    await db.collection<SavedMealPlan>("meal_plans").updateOne(
      { userId, weekStart, status: "active" },
      {
        $set: {
          [`days.${dayIndex}.meals.${slotIndex}`]: updatedSlot,
          [`days.${dayIndex}.nutritionActual`]: updatedNutrition,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    return NextResponse.json({
      slot: updatedSlot,
      nutritionActual: updatedNutrition,
    });
  } catch (err) {
    console.error("Slot swap error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Slot swap failed" },
      { status: 500 }
    );
  }
}
