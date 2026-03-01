import crypto from "crypto";
import { buildSpoonacularSearchUrl } from "./spoonacular";
import type {
    DayPlan,
    MealPlanConfig,
    MealSlot,
    MealType,
    NutritionSummary,
    SavedMealPlan,
    SpoonacularRecipe,
    UserPreferences,
    WeeklyMealPlan
} from "./types";

// ─── Budget splits by meal type ──────────────────────────────────────────────

const MEAL_TYPE_SPLITS: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.40,
  snack: 0.10,
};

// Map meal types to Spoonacular `type` param values
const SPOONACULAR_TYPE_MAP: Record<MealType, string> = {
  breakfast: "breakfast",
  lunch: "main course",
  dinner: "main course",
  snack: "snack",
};

// ─── Default meal type sets by mealsPerDay ────────────────────────────────────

export function defaultMealTypes(mealsPerDay: number): MealType[] {
  if (mealsPerDay === 1) return ["dinner"];
  if (mealsPerDay === 2) return ["lunch", "dinner"];
  return ["breakfast", "lunch", "dinner"];
}

// ─── Slot budget computation ──────────────────────────────────────────────────

/**
 * Compute per-slot calorie budgets from a daily target.
 * Normalizes splits across the provided meal types so they always sum to 1.
 */
export function computeSlotBudgets(
  dailyCalorieTarget: number,
  mealTypes: MealType[],
): Record<MealType, number> {
  const totalWeight = mealTypes.reduce((sum, mt) => sum + (MEAL_TYPE_SPLITS[mt] ?? 0.25), 0);
  const budgets: Partial<Record<MealType, number>> = {};
  for (const mt of mealTypes) {
    const weight = MEAL_TYPE_SPLITS[mt] ?? 0.25;
    budgets[mt] = Math.round((dailyCalorieTarget * weight) / totalWeight);
  }
  return budgets as Record<MealType, number>;
}

// ─── Nutrition helpers ────────────────────────────────────────────────────────

function getNutrient(recipe: SpoonacularRecipe, name: string): number {
  return recipe.nutrition?.nutrients?.find((n) => n.name === name)?.amount ?? 0;
}

export function computeDayNutrition(meals: MealSlot[]): NutritionSummary {
  let calories = 0, protein = 0, carbs = 0, fat = 0;
  for (const slot of meals) {
    if (slot.recipe) {
      calories += getNutrient(slot.recipe, "Calories");
      protein += getNutrient(slot.recipe, "Protein");
      carbs += getNutrient(slot.recipe, "Carbohydrates");
      fat += getNutrient(slot.recipe, "Fat");
    }
  }
  return {
    calories: Math.round(calories),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
  };
}

// ─── Spoonacular fetching ─────────────────────────────────────────────────────

/**
 * Fetch recipes from Spoonacular for a specific meal type and calorie target.
 */
export async function fetchSlotRecipes(
  mealType: MealType,
  calorieTarget: number,
  prefs: UserPreferences,
  apiKey: string,
  count: number,
  offset: number,
): Promise<SpoonacularRecipe[]> {
  const spoonacularType = SPOONACULAR_TYPE_MAP[mealType];
  const minCalories = calorieTarget > 0 ? Math.round(calorieTarget * 0.7) : 0;
  const maxCalories = calorieTarget > 0 ? Math.round(calorieTarget * 1.1) : 0;

  // Build overrides: type + calorie range derived from slot budget
  const overrides: Record<string, string | number | boolean> = {
    type: spoonacularType,
    number: count,
    offset,
    instructionsRequired: true,
  };
  if (minCalories > 0) overrides.minCalories = minCalories;
  if (maxCalories > 0) overrides.maxCalories = maxCalories;

  // Use prefs but strip includeIngredients (too restrictive as hard filter)
  // and strip per-meal calorie range (we're using slot budget instead)
  const prefsForSearch = {
    ...prefs,
    calorieRange: { min: 0, max: 0 }, // neutralize per-meal range
    mealTypes: [], // we override type
  };

  const url = buildSpoonacularSearchUrl(prefsForSearch, apiKey, overrides);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Spoonacular fetchSlotRecipes failed: ${res.status} for type=${mealType}`);
      return [];
    }
    const json = await res.json();
    return (json.results ?? []) as SpoonacularRecipe[];
  } catch (e) {
    console.error("fetchSlotRecipes error:", e);
    return [];
  }
}

// ─── Slot resolvers ───────────────────────────────────────────────────────────

async function resolveSpoonacularSlot(
  slot: MealSlot,
  recipePool: Map<MealType, SpoonacularRecipe[]>,
  usedIds: Set<number>,
): Promise<MealSlot> {
  const pool = recipePool.get(slot.mealType) ?? [];
  let found: SpoonacularRecipe | null = null;

  for (const candidate of pool) {
    if (!usedIds.has(candidate.id)) {
      found = candidate;
      usedIds.add(candidate.id);
      break;
    }
  }
  // Fallback: allow reuse if pool exhausted
  if (!found && pool.length > 0) {
    found = pool[Math.floor(Math.random() * pool.length)];
  }

  return {
    ...slot,
    type: found ? "recipe" : "empty",
    recipe: found ?? null,
  };
}

/**
 * Dispatch a slot to the right source. Extensible for future sources.
 */
export async function resolveSlot(
  slot: MealSlot,
  prefs: UserPreferences,
  recipePool: Map<MealType, SpoonacularRecipe[]>,
  usedIds: Set<number>,
): Promise<MealSlot> {
  switch (slot.source) {
    case "spoonacular":
      return resolveSpoonacularSlot(slot, recipePool, usedIds);
    case "takeout":
      return { ...slot, type: "takeout", recipe: null };
    // Future sources: doordash, instacart, homecook
    default:
      return { ...slot, type: "empty", recipe: null };
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

function getDayName(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][d.getUTCDay()];
}

// ─── Preferences hash ─────────────────────────────────────────────────────────

export function computePreferencesHash(prefs: UserPreferences): string {
  const key = JSON.stringify({
    excludeIngredients: prefs.excludeIngredients,
    preferredCuisines: prefs.preferredCuisines,
    excludeCuisine: prefs.excludeCuisine,
    diet: prefs.diet,
    intolerances: prefs.intolerances,
    calorieRange: prefs.calorieRange,
    proteinTarget: prefs.proteinTarget,
    dailyCalorieTarget: prefs.dailyCalorieTarget,
    dailyProteinTarget: prefs.dailyProteinTarget,
    dailyCarbTarget: prefs.dailyCarbTarget,
    dailyFatTarget: prefs.dailyFatTarget,
    takeoutDays: prefs.takeoutDays,
  });
  return crypto.createHash("md5").update(key).digest("hex");
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Generate a full weekly meal plan from user preferences and config.
 */
export async function generateWeeklyPlan(
  userId: string,
  prefs: UserPreferences,
  config: MealPlanConfig,
  apiKey: string,
): Promise<WeeklyMealPlan> {
  const { numDays, mealsPerDay, startDate } = config;
  const mealTypes = config.mealTypes?.length === mealsPerDay
    ? config.mealTypes
    : defaultMealTypes(mealsPerDay);

  const dailyCalorieTarget = prefs.dailyCalorieTarget > 0
    ? prefs.dailyCalorieTarget
    : (prefs.calorieRange?.max > 0 && prefs.calorieRange.max < 9999)
      ? prefs.calorieRange.max * mealsPerDay
      : 2000;

  let slotBudgets = computeSlotBudgets(dailyCalorieTarget, mealTypes);
  // Cap per-meal calories when user has calorieRange.max (e.g. "under 600 per meal")
  const perMealMax = prefs.calorieRange?.max > 0 && prefs.calorieRange.max < 9999
    ? prefs.calorieRange.max
    : null;
  if (perMealMax != null) {
    slotBudgets = Object.fromEntries(
      Object.entries(slotBudgets).map(([k, v]) => [k, Math.min(v, perMealMax)])
    ) as Record<MealType, number>;
  }

  // Build day stubs
  const days: DayPlan[] = Array.from({ length: numDays }, (_, i) => {
    const date = addDays(startDate, i);
    const dayName = getDayName(date);
    const isTakeoutDay = prefs.takeoutDays?.includes(dayName) ?? false;
    return {
      date,
      dayName,
      isTakeoutDay,
      meals: [],
      targetCalories: dailyCalorieTarget,
      nutritionActual: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    };
  });

  // Count non-takeout meals per type to know how many recipes we need
  const nonTakeoutDays = days.filter((d) => !d.isTakeoutDay);
  const recipesNeededPerType: Record<MealType, number> = {} as Record<MealType, number>;
  for (const mt of mealTypes) {
    recipesNeededPerType[mt] = nonTakeoutDays.length;
  }

  // Fetch recipe pools per meal type in parallel
  const recipePool = new Map<MealType, SpoonacularRecipe[]>();
  await Promise.all(
    mealTypes.map(async (mt) => {
      const needed = recipesNeededPerType[mt] ?? 0;
      if (needed === 0) return;
      const offset = Math.floor(Math.random() * 50);
      const recipes = await fetchSlotRecipes(mt, slotBudgets[mt], prefs, apiKey, Math.max(needed * 2, 20), offset);

      // Fallback: if not enough, retry with relaxed cuisine constraints
      if (recipes.length < needed) {
        const relaxedPrefs = { ...prefs, preferredCuisines: [], excludeCuisine: [] };
        const extra = await fetchSlotRecipes(mt, slotBudgets[mt], relaxedPrefs, apiKey, 30, Math.floor(Math.random() * 100));
        const existingIds = new Set(recipes.map((r) => r.id));
        for (const r of extra) {
          if (!existingIds.has(r.id)) recipes.push(r);
        }
      }
      // Fallback: if still empty (e.g. strict calorie filters), retry with relaxed constraints.
      // IMPORTANT: Never strip diet—vegetarian/vegan is a hard preference.
      if (recipes.length === 0) {
        const relaxedPrefs = {
          ...prefs,
          preferredCuisines: [],
          excludeCuisine: [],
          excludeIngredients: [],
          intolerances: [],
          calorieRange: { min: 0, max: 0 },
          proteinTarget: 0,
          carbRange: { min: 0, max: 999 },
          fatRange: { min: 0, max: 999 },
        };
        let fallback = await fetchSlotRecipes(mt, slotBudgets[mt], relaxedPrefs, apiKey, 30, Math.floor(Math.random() * 80));
        // Last resort: drop calorie constraints but keep diet (vegetarian meals over 600 cal > chicken)
        if (fallback.length === 0) {
          fallback = await fetchSlotRecipes(mt, 0, relaxedPrefs, apiKey, 30, Math.floor(Math.random() * 80));
        }
        for (const r of fallback) recipes.push(r);
      }
      recipePool.set(mt, recipes);
    })
  );

  // Assign meals to days
  const usedIds = new Set<number>();

  for (const day of days) {
    if (day.isTakeoutDay) {
      day.meals = mealTypes.map((mt, i): MealSlot => ({
        slotIndex: i,
        mealType: mt,
        type: "takeout",
        source: "takeout",
        recipe: null,
        isTakeout: true,
        calorieTarget: slotBudgets[mt],
      }));
    } else {
      const resolvedSlots = await Promise.all(
        mealTypes.map(async (mt, i) => {
          const stub: MealSlot = {
            slotIndex: i,
            mealType: mt,
            type: "empty",
            source: "spoonacular",
            recipe: null,
            isTakeout: false,
            calorieTarget: slotBudgets[mt],
          };
          return resolveSlot(stub, prefs, recipePool, usedIds);
        })
      );
      day.meals = resolvedSlots;
    }
    day.nutritionActual = computeDayNutrition(day.meals);
  }

  return {
    userId,
    config: { ...config, mealTypes },
    days,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Convert WeeklyMealPlan to SavedMealPlan for MongoDB persistence.
 */
export function toSavedMealPlan(
  plan: WeeklyMealPlan,
  weekStart: string,
  prefs: UserPreferences,
  version = 1,
): SavedMealPlan {
  return {
    userId: plan.userId,
    weekStart,
    config: plan.config,
    days: plan.days,
    generatedAt: plan.generatedAt,
    updatedAt: new Date().toISOString(),
    version,
    status: "active",
    preferencesHash: computePreferencesHash(prefs),
  };
}
