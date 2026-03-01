import type { ExtractedConstraints } from "./types";

/**
 * Constraints type that has the Spoonacular-relevant fields.
 * Both ExtractedConstraints and UserPreferences satisfy this.
 */
type SpoonacularConstraints = Pick<
  ExtractedConstraints,
  | "excludeIngredients"
  | "preferredCuisines"
  | "excludeCuisine"
  | "diet"
  | "intolerances"
  | "calorieRange"
  | "proteinTarget"
  | "carbRange"
  | "fatRange"
  | "sodiumRange"
  | "sugarRange"
  | "maxReadyTime"
  | "mealTypes"
  | "equipment"
  | "servingRange"
  | "query"
  | "sortPreference"
  | "sortDirection"
>;

/**
 * Params ready to pass to Spoonacular complexSearch.
 * All values are primitives (string | number | boolean) for URL query strings.
 */
export interface SpoonacularSearchParams {
  [key: string]: string | number | boolean;
}

/**
 * Converts MongoDB user preferences (or extracted constraints) into
 * Spoonacular complexSearch API parameters.
 *
 * Usage in Planning Agent:
 *   const prefs = await getPreferences(userId);
 *   const params = toSpoonacularParams(prefs);
 *   const qs = new URLSearchParams(
 *     Object.fromEntries(
 *       Object.entries(params).map(([k, v]) => [k, String(v)])
 *     )
 *   ).toString();
 *   const url = `https://api.spoonacular.com/recipes/complexSearch?${qs}&apiKey=${API_KEY}`;
 *
 * Only includes params with meaningful values (skips empty arrays, 0, etc.)
 */
export function toSpoonacularParams(
  constraints: SpoonacularConstraints | null | undefined
): SpoonacularSearchParams {
  const params: SpoonacularSearchParams = {};

  if (!constraints) return params;

  // Arrays → comma-separated strings (Spoonacular format)
  if (constraints.excludeIngredients?.length)
    params.excludeIngredients = constraints.excludeIngredients.join(",");
  if (constraints.preferredCuisines?.length)
    params.cuisine = constraints.preferredCuisines.join(",");
  if (constraints.excludeCuisine?.length)
    params.excludeCuisine = constraints.excludeCuisine.join(",");
  if (constraints.intolerances?.length)
    params.intolerances = constraints.intolerances.join(",");
  if (constraints.mealTypes?.length)
    params.type = constraints.mealTypes[0]; // Spoonacular takes one type; use first
  if (constraints.equipment?.length)
    params.equipment = constraints.equipment.join(",");

  // Diet (single value)
  if (constraints.diet?.trim()) params.diet = constraints.diet.trim();

  // Nutrition ranges
  const { calorieRange, carbRange, fatRange, sodiumRange, sugarRange } =
    constraints;
  if (calorieRange?.min > 0) params.minCalories = calorieRange.min;
  if (calorieRange?.max > 0 && calorieRange.max < 9999)
    params.maxCalories = calorieRange.max;
  if (constraints.proteinTarget > 0) params.minProtein = constraints.proteinTarget;
  if (carbRange?.min > 0) params.minCarbs = carbRange.min;
  if (carbRange?.max > 0 && carbRange.max < 999) params.maxCarbs = carbRange.max;
  if (fatRange?.min > 0) params.minFat = fatRange.min;
  if (fatRange?.max > 0 && fatRange.max < 999) params.maxFat = fatRange.max;
  if (sodiumRange?.min > 0) params.minSodium = sodiumRange.min;
  if (sodiumRange?.max > 0 && sodiumRange.max < 9999)
    params.maxSodium = sodiumRange.max;
  if (sugarRange?.min > 0) params.minSugar = sugarRange.min;
  if (sugarRange?.max > 0 && sugarRange.max < 999)
    params.maxSugar = sugarRange.max;

  // Time & servings
  if (constraints.maxReadyTime > 0) params.maxReadyTime = constraints.maxReadyTime;
  const { servingRange } = constraints;
  if (servingRange?.min > 0) params.minServings = servingRange.min;
  if (servingRange?.max > 0) params.maxServings = servingRange.max;

  // Query & sort
  if (constraints.query?.trim()) params.query = constraints.query.trim();
  if (constraints.sortPreference?.trim()) {
    params.sort = constraints.sortPreference.trim();
    params.sortDirection = constraints.sortDirection || "asc";
  }

  // Recommended for Planning: get full recipe + nutrition in one call
  params.addRecipeNutrition = true;
  params.addRecipeInformation = true;

  return params;
}

/**
 * Builds a Spoonacular complexSearch URL with preferences applied.
 * Use when you have constraints and want a ready-to-fetch URL.
 *
 * @param constraints - From MongoDB user_preferences or intake extraction
 * @param apiKey - Spoonacular API key
 * @param overrides - Optional params to override (e.g. number: 20, offset: 0)
 */
export function buildSpoonacularSearchUrl(
  constraints: SpoonacularConstraints | null | undefined,
  apiKey: string,
  overrides: SpoonacularSearchParams = {}
): string {
  const params = { ...toSpoonacularParams(constraints), apiKey, ...overrides };
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    )
  ).toString();
  return `https://api.spoonacular.com/recipes/complexSearch?${qs}`;
}
