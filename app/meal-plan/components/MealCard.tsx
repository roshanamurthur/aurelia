import type { MealSlot, SpoonacularRecipe } from "@/lib/types";

interface MealCardProps {
  slot: MealSlot;
}

function getNutrient(recipe: SpoonacularRecipe, name: string): number {
  return recipe.nutrition.nutrients.find((n) => n.name === name)?.amount ?? 0;
}

export default function MealCard({ slot }: MealCardProps) {
  if (slot.type === "empty" || !slot.recipe) {
    return (
      <div className="text-sm text-stone-400 dark:text-stone-500 italic py-4 text-center">
        No recipe found
      </div>
    );
  }

  const { recipe } = slot;
  const calories = Math.round(getNutrient(recipe, "Calories"));
  const protein = Math.round(getNutrient(recipe, "Protein"));
  const carbs = Math.round(getNutrient(recipe, "Carbohydrates"));
  const fat = Math.round(getNutrient(recipe, "Fat"));

  return (
    <div className="flex flex-col gap-2">
      {recipe.image && (
        <img
          src={recipe.image}
          alt={recipe.title}
          className="w-full h-32 object-cover rounded-lg"
        />
      )}
      <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 line-clamp-2 leading-snug">
        {recipe.title}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span className="text-xs text-stone-500 dark:text-stone-400">{calories} kcal</span>
        <span className="text-xs text-stone-500 dark:text-stone-400">{protein}g P</span>
        <span className="text-xs text-stone-500 dark:text-stone-400">{carbs}g C</span>
        <span className="text-xs text-stone-500 dark:text-stone-400">{fat}g F</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-400 dark:text-stone-500">&#9203; {recipe.readyInMinutes} min</span>
        <a
          href={recipe.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 font-medium transition-colors"
        >
          View recipe &rarr;
        </a>
      </div>
    </div>
  );
}
