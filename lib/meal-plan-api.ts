/**
 * Shared meal plan logic - used by both API route and page to avoid HTTP round-trip.
 */
import { connectDB } from "@/lib/mongodb";
import {
    computePreferencesHash,
    defaultMealTypes,
    generateWeeklyPlan,
    toSavedMealPlan,
} from "@/lib/planning-engine";
import type {
    MealPlanConfig,
    SavedMealPlan,
    UserPreferences
} from "@/lib/types";
import { ObjectId } from "mongodb";

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

/** Check if string looks like a MongoDB ObjectId (24 hex chars). */
function isObjectIdString(s: string): boolean {
  return /^[a-f0-9]{24}$/i.test(s);
}

/** Resolve user email from auth_users for meal plan traceability in MongoDB. Exported for use in API routes. */
export async function resolveUserEmail(db: Awaited<ReturnType<typeof connectDB>>, userId: string): Promise<string | undefined> {
  if (userId === "demo" || !isObjectIdString(userId)) return undefined;
  try {
    const user = await db.collection("auth_users").findOne(
      { _id: new ObjectId(userId) },
      { projection: { email: 1 } }
    );
    return user?.email as string | undefined;
  } catch {
    return undefined;
  }
}

const defaultPrefs: UserPreferences = {
  userId: "",
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

export interface GetMealPlanParams {
  userId: string;
  numDays: number;
  mealsPerDay: number;
  startDate: string;
}

export interface GetMealPlanResult {
  plan: SavedMealPlan | null;
  error: string | null;
}

export async function getMealPlanData(params: GetMealPlanParams): Promise<GetMealPlanResult> {
  try {
    const { userId, numDays, mealsPerDay, startDate } = params;
    const weekStart = getMondayOfWeek(startDate);

    const db = await connectDB();
    const prefs = await db.collection<UserPreferences>("user_preferences").findOne({ userId });

    const mealTypes = defaultMealTypes(mealsPerDay);
    const config: MealPlanConfig = { numDays, mealsPerDay, startDate, mealTypes };

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
          dailyCalorieTarget: (prefs.dailyCalorieTarget ?? 0) > 0 ? prefs.dailyCalorieTarget! : 2000,
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
      : { ...defaultPrefs, userId };

    const currentHash = computePreferencesHash(effectivePrefs);

    const existing = await db.collection<SavedMealPlan>("meal_plans").findOne({
      userId,
      weekStart,
      status: "active",
    });

    if (existing) {
      const prefsChanged = existing.preferencesHash != null && existing.preferencesHash !== currentHash;
      const mealCount = (existing.days ?? []).reduce(
        (sum: number, d: { meals?: { recipe?: unknown }[] }) =>
          sum + (d.meals?.filter((m) => m.recipe).length ?? 0),
        0
      );
      const isEmptyPlan = mealCount === 0;
      if (!prefsChanged && !isEmptyPlan) {
        const filteredDays = (existing.days ?? [])
          .filter((d: { date: string }) => d.date >= startDate)
          .slice(0, numDays);
        if (filteredDays.length > 0) {
          return {
            plan: { ...existing, days: filteredDays, config: { ...existing.config, numDays: filteredDays.length } },
            error: null,
          };
        }
      }
      if (prefsChanged || isEmptyPlan) {
        await db.collection<SavedMealPlan>("meal_plans").updateMany(
          { userId, weekStart, status: "active" },
          { $set: { status: "archived" } }
        );
      }
    }

    const apiKey = process.env.SPOONACULAR_API_KEY;
    if (!apiKey) {
      return { plan: null, error: "SPOONACULAR_API_KEY is not configured" };
    }

    const plan = await generateWeeklyPlan(userId, effectivePrefs, config, apiKey);
    const saved = toSavedMealPlan(plan, weekStart, effectivePrefs, 1);
    const userEmail = await resolveUserEmail(db, userId);
    if (userEmail) (saved as SavedMealPlan & { userEmail?: string }).userEmail = userEmail;

    await db.collection<SavedMealPlan>("meal_plans").insertOne(saved);

    return { plan: saved, error: null };
  } catch (err) {
    console.error("getMealPlanData error:", err);
    return {
      plan: null,
      error: err instanceof Error ? err.message : "Meal plan generation failed",
    };
  }
}
