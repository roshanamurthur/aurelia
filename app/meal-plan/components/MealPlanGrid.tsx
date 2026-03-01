"use client";

import type { WeeklyMealPlan } from "@/lib/types";
import DayCard from "./DayCard";

interface MealPlanGridProps {
  plan: WeeklyMealPlan;
}

export default function MealPlanGrid({ plan }: MealPlanGridProps) {
  return (
    <div>
      <p className="text-xs text-stone-400 dark:text-stone-500 mb-4">
        Generated {new Date(plan.generatedAt).toLocaleString()} &middot; {plan.config.numDays} days &middot; {plan.config.mealsPerDay} meal{plan.config.mealsPerDay > 1 ? "s" : ""}/day
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {plan.days.map((day) => (
          <DayCard key={day.date} day={day} />
        ))}
      </div>
    </div>
  );
}
