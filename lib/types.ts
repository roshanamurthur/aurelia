export interface UserPreferences {
  userId: string;
  excludeIngredients: string[];
  includeIngredients?: string[];
  preferredCuisines: string[];
  excludeCuisine: string[];
  diet: string;
  intolerances: string[];
  calorieRange: { min: number; max: number };
  proteinTarget: number;
  carbRange: { min: number; max: number };
  fatRange: { min: number; max: number };
  sodiumRange: { min: number; max: number };
  sugarRange: { min: number; max: number };
  maxReadyTime: number;
  mealTypes: string[];
  equipment: string[];
  servingRange: { min: number; max: number };
  query: string;
  sortPreference: string;
  sortDirection: "asc" | "desc";
  takeoutDays: string[];
  swapHistory: Array<{ recipeId: number; reason?: string }>;
  // Daily nutritional targets (0 = not set)
  dailyCalorieTarget: number;
  dailyProteinTarget: number;
  dailyCarbTarget: number;
  dailyFatTarget: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExtractedConstraints {
  excludeIngredients: string[];
  includeIngredients?: string[];
  preferredCuisines: string[];
  excludeCuisine: string[];
  diet: string;
  intolerances: string[];
  calorieRange: { min: number; max: number };
  proteinTarget: number;
  carbRange: { min: number; max: number };
  fatRange: { min: number; max: number };
  sodiumRange: { min: number; max: number };
  sugarRange: { min: number; max: number };
  maxReadyTime: number;
  mealTypes: string[];
  equipment: string[];
  servingRange: { min: number; max: number };
  query: string;
  sortPreference: string;
  sortDirection: "asc" | "desc";
  takeoutDays: string[];
  // Daily nutritional targets (0 = not set)
  dailyCalorieTarget: number;
  dailyProteinTarget: number;
  dailyCarbTarget: number;
  dailyFatTarget: number;
  /** Fields user explicitly skipped ("no allergies", "none", "skip") - don't re-ask */
  skippedFields?: string[];
}

export interface IntakeChatResponse {
  extracted: ExtractedConstraints;
  merged: ExtractedConstraints;
  saved: boolean;
  nextQuestion: string | null;
}

// ─── Spoonacular API Response Shape ───────────────────────────────────────────

export interface SpoonacularRecipe {
  id: number;
  title: string;
  image: string;
  readyInMinutes: number;
  servings: number;
  sourceUrl: string;
  nutrition: {
    nutrients: Array<{
      name: string;
      amount: number;
      unit: string;
    }>;
  };
}

// ─── Meal Plan Domain Types ───────────────────────────────────────────────────

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type MealSource = "spoonacular" | "takeout" | "doordash" | "instacart" | "homecook";

export interface MealSlot {
  slotIndex: number;
  mealType: MealType;
  type: "recipe" | "takeout" | "empty";
  source: MealSource;
  recipe: SpoonacularRecipe | null;
  isTakeout: boolean;
  calorieTarget: number;
}

export interface NutritionSummary {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DayPlan {
  date: string;
  dayName: string;
  isTakeoutDay: boolean;
  meals: MealSlot[];
  targetCalories: number;
  nutritionActual: NutritionSummary;
}

export interface WeeklyMealPlan {
  userId: string;
  config: MealPlanConfig;
  days: DayPlan[];
  generatedAt: string;
}

export interface SavedMealPlan {
  userId: string;
  /** User email for MongoDB admin visibility (links to auth_users.email) */
  userEmail?: string;
  weekStart: string;
  config: MealPlanConfig;
  days: DayPlan[];
  generatedAt: string;
  updatedAt: string;
  version: number;
  status: "active" | "archived";
  preferencesHash: string;
}

export interface MealPlanConfig {
  numDays: number;
  mealsPerDay: number;
  startDate: string;
  mealTypes: MealType[];
}

export interface MealPlanApiResponse {
  plan: WeeklyMealPlan | null;
  error?: string;
}

export interface SavedMealPlanApiResponse {
  plan: SavedMealPlan | null;
  error?: string;
}

export const TRACKED_NUTRIENTS = ["Calories", "Protein", "Carbohydrates", "Fat"] as const;
export type TrackedNutrient = (typeof TRACKED_NUTRIENTS)[number];
