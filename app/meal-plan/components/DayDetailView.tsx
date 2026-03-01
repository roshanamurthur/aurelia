"use client";

import type { DayPlan, MealSlot } from "@/lib/types";
import RecipeInstructions from "./RecipeInstructions";
import TakeoutCard from "./TakeoutCard";
import TonightPrep from "./TonightPrep";

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

interface DayDetailViewProps {
  day: DayPlan;
  onBack: () => void;
}

function MealDetail({ slot }: { slot: MealSlot }) {
  if (!slot.recipe || slot.isTakeout) return null;
  const { recipe } = slot;
  const label = MEAL_LABELS[slot.mealType] ?? slot.mealType;
  const calories = recipe.nutrition?.nutrients?.find((n) => n.name === "Calories")?.amount ?? 0;

  const mealBg =
    slot.mealType === "lunch"
      ? "bg-stone-100/80 dark:bg-stone-800/40"
      : slot.mealType === "dinner"
        ? "bg-orange-50/30 dark:bg-orange-950/15"
        : "bg-white/80 dark:bg-stone-900/80";

  return (
    <section className={`rounded-2xl border border-stone-200/80 dark:border-stone-700/80 ${mealBg} p-6 shadow-sm`}>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500">
            {label}
          </p>
          <h3 className="font-display text-xl font-semibold text-stone-900 dark:text-stone-100 mt-1">
            {recipe.title}
          </h3>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            {Math.round(calories)} kcal · {recipe.readyInMinutes} min
          </p>
        </div>
        <a
          href={recipe.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 px-4 py-2 rounded-xl bg-rust-500/90 hover:bg-rust-600 text-white text-sm font-medium transition-colors shadow-sm"
        >
          Open recipe
        </a>
      </div>
      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
            Ingredients
          </h4>
          <TonightPrep
            recipeId={recipe.id}
            recipeTitle={recipe.title}
            recipeUrl={recipe.sourceUrl ?? "#"}
            compact
          />
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
            Prep instructions
          </h4>
          <RecipeInstructions recipeId={recipe.id} />
        </div>
      </div>
    </section>
  );
}

export default function DayDetailView({ day, onBack }: DayDetailViewProps) {
  const d = new Date(day.date + "T00:00:00Z");
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(d);
  const dateStr = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);

  const meals = (day.meals ?? []).filter((m) => m.recipe && !m.isTakeout);
  const breakfast = meals.find((m) => m.mealType === "breakfast");
  const lunch = meals.find((m) => m.mealType === "lunch");
  const dinner = meals.find((m) => m.mealType === "dinner");
  const otherMeals = meals.filter((m) => !["breakfast", "lunch", "dinner"].includes(m.mealType));

  if (day.isTakeoutDay) {
    const takeoutSlots = (day.meals ?? []).filter((m) => m.isTakeout);
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-stone-600 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
        >
          ← Back to week
        </button>
        <header className="border-b border-stone-200/80 dark:border-stone-700/80 pb-6">
          <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
            {weekday}, {dateStr}
          </h1>
          <p className="text-sm text-rust-600 dark:text-rust-400 mt-1">Takeout day</p>
        </header>
        <div className="space-y-4">
          {takeoutSlots.map((slot) => (
            <div
              key={slot.slotIndex}
              className="rounded-2xl border border-rust-200 dark:border-rust-800 bg-rust-50/30 dark:bg-rust-900/20 p-6"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-rust-600 dark:text-rust-400">
                {MEAL_LABELS[slot.mealType] ?? slot.mealType}
              </p>
              <p className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100 mt-1">Takeout</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-white/70 dark:bg-stone-900/70 p-8 shadow-sm">
          <TakeoutCard dayName={day.dayName} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-stone-600 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 transition-colors"
      >
        ← Back to week
      </button>
      <header className="border-b border-stone-200/80 dark:border-stone-700/80 pb-6">
        <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
          {weekday}, {dateStr}
        </h1>
        {day.nutritionActual?.calories != null && day.targetCalories != null && day.targetCalories > 0 && (
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            {day.nutritionActual.calories} / {day.targetCalories} kcal
          </p>
        )}
      </header>
      <div className="space-y-6">
        {meals.map((slot) => (
          <MealDetail key={slot.slotIndex} slot={slot} />
        ))}
      </div>
    </div>
  );
}
