import type { DayPlan } from "@/lib/types";
import MealCard from "./MealCard";
import TakeoutCard from "./TakeoutCard";

interface DayCardProps {
  day: DayPlan;
}

export default function DayCard({ day }: DayCardProps) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(day.date + "T00:00:00Z"));

  return (
    <div className="rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm p-4 flex flex-col gap-3">
      <div className="border-b border-stone-100 dark:border-stone-800 pb-2">
        <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
          {formatted}
        </p>
      </div>

      {day.isTakeoutDay ? (
        <TakeoutCard dayName={day.dayName} />
      ) : (
        day.meals.map((slot) => (
          <MealCard key={slot.slotIndex} slot={slot} />
        ))
      )}
    </div>
  );
}
