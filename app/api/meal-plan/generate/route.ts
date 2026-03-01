import { resolveUserEmail } from "@/lib/meal-plan-api";
import { connectDB } from "@/lib/mongodb";
import {
    defaultMealTypes,
    generateWeeklyPlan,
    toSavedMealPlan,
} from "@/lib/planning-engine";
import type {
    MealPlanConfig,
    MealType,
    SavedMealPlan,
    UserPreferences,
} from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

function getMondayOfWeek(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = (body.userId as string | undefined)?.trim() || "demo";
    const numDays = typeof body.numDays === "number" ? Math.min(14, Math.max(1, body.numDays)) : 7;
    const mealsPerDay = [1, 2, 3].includes(body.mealsPerDay) ? body.mealsPerDay : 3;
    const startDate = typeof body.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
      ? body.startDate
      : todayISO();

    const weekStart = getMondayOfWeek(startDate);

    const apiKey = process.env.SPOONACULAR_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ plan: null, error: "SPOONACULAR_API_KEY is not configured" }, { status: 500 });
    }

    const db = await connectDB();
    const prefs = await db.collection<UserPreferences>("user_preferences").findOne({ userId });

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
      ? {
          ...defaultPrefs,
          ...prefs,
          userId,
          diet: typeof prefs.diet === "string" ? prefs.diet : defaultPrefs.diet,
          calorieRange:
            prefs.calorieRange && typeof prefs.calorieRange === "object"
              ? { min: prefs.calorieRange.min ?? 0, max: prefs.calorieRange.max ?? 0 }
              : defaultPrefs.calorieRange,
          dailyCalorieTarget: (prefs.dailyCalorieTarget ?? 0) > 0 ? prefs.dailyCalorieTarget! : defaultPrefs.dailyCalorieTarget,
          excludeIngredients: Array.isArray(prefs.excludeIngredients) ? prefs.excludeIngredients : defaultPrefs.excludeIngredients,
          preferredCuisines: Array.isArray(prefs.preferredCuisines) ? prefs.preferredCuisines : defaultPrefs.preferredCuisines,
          excludeCuisine: Array.isArray(prefs.excludeCuisine) ? prefs.excludeCuisine : defaultPrefs.excludeCuisine,
          intolerances: Array.isArray(prefs.intolerances) ? prefs.intolerances : defaultPrefs.intolerances,
          takeoutDays: Array.isArray(prefs.takeoutDays) ? prefs.takeoutDays : defaultPrefs.takeoutDays,
          proteinTarget: typeof prefs.proteinTarget === "number" ? prefs.proteinTarget : defaultPrefs.proteinTarget,
          carbRange:
            prefs.carbRange && typeof prefs.carbRange === "object"
              ? { min: prefs.carbRange.min ?? 0, max: prefs.carbRange.max ?? 999 }
              : defaultPrefs.carbRange,
          fatRange:
            prefs.fatRange && typeof prefs.fatRange === "object"
              ? { min: prefs.fatRange.min ?? 0, max: prefs.fatRange.max ?? 999 }
              : defaultPrefs.fatRange,
          maxReadyTime: typeof prefs.maxReadyTime === "number" ? prefs.maxReadyTime : defaultPrefs.maxReadyTime,
        }
      : defaultPrefs;

    const mealTypes: MealType[] = defaultMealTypes(mealsPerDay);
    const config: MealPlanConfig = { numDays, mealsPerDay, startDate, mealTypes };

    // Archive previous active plan for this week
    await db.collection<SavedMealPlan>("meal_plans").updateMany(
      { userId, weekStart, status: "active" },
      { $set: { status: "archived" } }
    );

    // Find current version number
    const latest = await db.collection<SavedMealPlan>("meal_plans")
      .find({ userId, weekStart })
      .sort({ version: -1 })
      .limit(1)
      .toArray();
    const nextVersion = latest.length > 0 ? (latest[0].version ?? 1) + 1 : 1;

    const plan = await generateWeeklyPlan(userId, effectivePrefs, config, apiKey);
    const saved = toSavedMealPlan(plan, weekStart, effectivePrefs, nextVersion);
    const userEmail = await resolveUserEmail(db, userId);
    if (userEmail) (saved as SavedMealPlan & { userEmail?: string }).userEmail = userEmail;

    await db.collection<SavedMealPlan>("meal_plans").insertOne(saved);

    return NextResponse.json({ plan: saved });
  } catch (err) {
    console.error("Meal plan generate error:", err);
    return NextResponse.json(
      { plan: null, error: err instanceof Error ? err.message : "Regeneration failed" },
      { status: 500 }
    );
  }
}
