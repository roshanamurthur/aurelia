"use client";

import type { MealPlanConfig } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface MealPlanControlsProps {
  initialConfig: MealPlanConfig;
  userId: string;
}

export default function MealPlanControls({ initialConfig, userId }: MealPlanControlsProps) {
  const router = useRouter();
  const [numDays, setNumDays] = useState(initialConfig.numDays);
  const [mealsPerDay, setMealsPerDay] = useState(initialConfig.mealsPerDay);

  const handleRegenerate = () => {
    const params = new URLSearchParams({
      userId,
      numDays: String(numDays),
      mealsPerDay: String(mealsPerDay),
      startDate: initialConfig.startDate,
    });
    router.push(`/meal-plan?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={numDays}
        onChange={(e) => setNumDays(parseInt(e.target.value, 10))}
        className="rounded-lg border border-stone-200 dark:border-stone-600 bg-white/80 dark:bg-stone-900/80 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-rust-400/40"
      >
        {Array.from({ length: 14 }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {d}d
          </option>
        ))}
      </select>
      <select
        value={mealsPerDay}
        onChange={(e) => setMealsPerDay(parseInt(e.target.value, 10))}
        className="rounded-lg border border-stone-200 dark:border-stone-600 bg-white/80 dark:bg-stone-900/80 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-rust-400/40"
      >
        <option value={1}>1 meal</option>
        <option value={2}>2 meals</option>
        <option value={3}>3 meals</option>
      </select>
      <button
        onClick={handleRegenerate}
        className="px-4 py-2 rounded-lg bg-rust-500/85 hover:bg-rust-600 text-white text-sm font-medium transition-colors"
      >
        Generate Plan
      </button>
    </div>
  );
}
