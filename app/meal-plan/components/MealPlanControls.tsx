"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MealPlanConfig } from "@/lib/types";

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
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider">
          Days to plan
        </label>
        <select
          value={numDays}
          onChange={(e) => setNumDays(parseInt(e.target.value, 10))}
          className="rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
        >
          {Array.from({ length: 14 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d} {d === 1 ? "day" : "days"}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider">
          Meals per day
        </label>
        <select
          value={mealsPerDay}
          onChange={(e) => setMealsPerDay(parseInt(e.target.value, 10))}
          className="rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
        >
          <option value={1}>1 meal</option>
          <option value={2}>2 meals</option>
          <option value={3}>3 meals</option>
        </select>
      </div>

      <button
        onClick={handleRegenerate}
        className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors"
      >
        Generate Plan
      </button>
    </div>
  );
}
