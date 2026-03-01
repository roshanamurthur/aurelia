"use client";

import type { MealSlot, SpoonacularRecipe } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import TonightPrep from "./TonightPrep";

interface MealCardProps {
  slot: MealSlot;
  date: string;
  userId: string;
  weekStart: string;
  onSwap?: () => void;
  variant?: "card" | "button";
}

function getNutrient(recipe: SpoonacularRecipe, name: string): number {
  return recipe.nutrition.nutrients.find((n) => n.name === name)?.amount ?? 0;
}

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

export default function MealCard({ slot, date, userId, weekStart, onSwap, variant = "card" }: MealCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const router = useRouter();
  const mealLabel = MEAL_TYPE_LABELS[slot.mealType] ?? slot.mealType;

  const handleSwap = async () => {
    if (slot.isTakeout || !slot.recipe) return;
    setSwapping(true);
    try {
      const res = await fetch("/api/meal-plan/slot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          weekStart,
          date,
          slotIndex: slot.slotIndex,
        }),
      });
      if (res.ok) {
        setModalOpen(false);
        router.refresh();
        onSwap?.();
      }
    } finally {
      setSwapping(false);
    }
  };

  if (slot.type === "empty" || !slot.recipe) {
    return null;
  }

  const { recipe } = slot;
  const calories = Math.round(getNutrient(recipe, "Calories"));
  const protein = Math.round(getNutrient(recipe, "Protein"));
  const carbs = Math.round(getNutrient(recipe, "Carbohydrates"));
  const fat = Math.round(getNutrient(recipe, "Fat"));

  const isButton = variant === "button";
  const showPrep = date === getToday() && slot.mealType === "dinner";

  const mealBg =
    slot.mealType === "lunch"
      ? "bg-stone-100/70 dark:bg-stone-800/30"
      : slot.mealType === "dinner"
        ? "bg-orange-50/25 dark:bg-orange-950/10"
        : "";

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`w-full text-left transition-colors ${
          isButton
            ? "rounded-lg border-b border-stone-200 dark:border-stone-700 py-2 px-0 hover:bg-stone-50/50 dark:hover:bg-stone-800/30"
            : `rounded-lg p-2 hover:bg-rust-50/40 dark:hover:bg-rust-900/20 ${mealBg}`
        }`}
      >
        <div className="flex flex-col gap-0">
          <span className="text-xs font-medium text-stone-600 dark:text-stone-400">
            {mealLabel}
          </span>
          <span className="font-display text-sm font-medium text-stone-900 dark:text-stone-100 text-left line-clamp-2">
            {recipe.title}
          </span>
        </div>
        {!isButton && (
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            {calories} kcal · {recipe.readyInMinutes} min
          </p>
        )}
      </button>

      {modalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          >
            <div
              className="relative bg-white dark:bg-stone-900 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-none bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-300 flex items-center justify-center text-lg leading-none"
              >
                &times;
              </button>
              {recipe.image && (
                <img
                  src={recipe.image}
                  alt={recipe.title}
                  className="w-full aspect-video object-cover"
                />
              )}
              <div className="p-5 flex-1 overflow-y-auto">
                <h3 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">
                  {recipe.title}
                </h3>
                <div className="flex flex-wrap gap-3 text-sm text-stone-600 dark:text-stone-400 mb-4">
                  <span>{recipe.readyInMinutes} min</span>
                  <span>{recipe.servings} servings</span>
                  <span>{calories} kcal</span>
                  <span>{protein}g protein</span>
                  <span>{carbs}g carbs</span>
                  <span>{fat}g fat</span>
                </div>
                {showPrep && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">Prep</p>
                    <TonightPrep
                      recipeId={recipe.id}
                      recipeTitle={recipe.title}
                      recipeUrl={recipe.sourceUrl ?? "#"}
                      compact
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <a
                    href={recipe.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-3 rounded-xl bg-rust-500/90 hover:bg-rust-600 text-white font-medium text-center transition-colors"
                  >
                    Open recipe
                  </a>
                  {!slot.isTakeout && (
                    <button
                      type="button"
                      onClick={handleSwap}
                      disabled={swapping}
                      className="px-4 py-3 rounded-xl border border-stone-300 dark:border-stone-600 hover:bg-stone-50 dark:hover:bg-stone-800 text-sm font-medium disabled:opacity-50"
                    >
                      {swapping ? "Swapping…" : "Swap"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
