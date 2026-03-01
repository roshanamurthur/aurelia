"use client";

import NutritionRing from "./NutritionRing";

interface WeekSummaryCardProps {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  targetCal?: number;
  mealCount: number;
  onOpenChat: () => void;
}

export default function WeekSummaryCard({
  calories,
  protein,
  carbs,
  fat,
  targetCal,
  mealCount,
  onOpenChat,
}: WeekSummaryCardProps) {
  return (
    <div className="w-full min-w-0 rounded-xl border border-stone-200/80 dark:border-stone-700/80 bg-white/80 dark:bg-stone-900/80 p-5 shadow-sm flex flex-col items-center justify-center gap-4">
      <NutritionRing
        calories={calories}
        protein={protein}
        carbs={carbs}
        fat={fat}
        targetCal={targetCal}
        size={100}
      />
      <p className="text-xs text-stone-500 dark:text-stone-400">
        {mealCount} meals planned
      </p>
      <button
        type="button"
        onClick={onOpenChat}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-sm font-medium transition-colors"
        title="Adjust meals and preferences"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        Adjust plan
      </button>
    </div>
  );
}
