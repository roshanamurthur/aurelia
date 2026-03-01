export interface UserPreferences {
  userId: string;
  excludeIngredients: string[];
  includeIngredients: string[];
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
  createdAt: Date;
  updatedAt: Date;
}

export interface ExtractedConstraints {
  excludeIngredients: string[];
  includeIngredients: string[];
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

export interface MealSlot {
  slotIndex: number;
  type: "recipe" | "takeout" | "empty";
  recipe: SpoonacularRecipe | null;
  isTakeout: boolean;
}

export interface DayPlan {
  date: string;
  dayName: string;
  isTakeoutDay: boolean;
  meals: MealSlot[];
}

export interface WeeklyMealPlan {
  userId: string;
  config: MealPlanConfig;
  days: DayPlan[];
  generatedAt: string;
}

export interface MealPlanConfig {
  numDays: number;
  mealsPerDay: number;
  startDate: string;
}

export interface MealPlanApiResponse {
  plan: WeeklyMealPlan | null;
  error?: string;
}

export const TRACKED_NUTRIENTS = ["Calories", "Protein", "Carbohydrates", "Fat"] as const;
export type TrackedNutrient = (typeof TRACKED_NUTRIENTS)[number];
