"use client";

import type { DayPlan } from "@/lib/types";
import { DraggableMealCard } from "./DraggableMealCard";
import TakeoutCard from "./TakeoutCard";

interface DayCardProps {
  day: DayPlan;
  userId: string;
  weekStart: string;
  onSlotUpdate?: () => void;
  onDayClick?: () => void;
}

export default function DayCard({ day, userId, weekStart, onSlotUpdate, onDayClick }: DayCardProps) {
  const d = new Date(day.date + "T00:00:00Z");
  const dayNum = d.getUTCDate();
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d);
  const dateLabel = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(d);
  const today = new Date().toISOString().split("T")[0];
  const isToday = day.date === today;

  const actualCalories = day.nutritionActual?.calories ?? 0;
  const targetCalories = day.targetCalories ?? 0;
  const progress = targetCalories > 0 ? Math.min(1, actualCalories / targetCalories) : 0;
  const isOver = actualCalories > targetCalories * 1.15;
  const isOnTrack = targetCalories > 0 && !day.isTakeoutDay && actualCalories <= targetCalories * 1.1 && actualCalories >= targetCalories * 0.7;
  const showBar = targetCalories > 0 && !day.isTakeoutDay;

  const prepMins = (day.meals ?? [])
    .filter((m) => m.recipe?.readyInMinutes)
    .reduce((s, m) => s + (m.recipe!.readyInMinutes ?? 0), 0);

  return (
    <div className={`w-full min-w-0 min-h-[280px] flex flex-col rounded-xl bg-white/70 dark:bg-stone-900/70 overflow-hidden border border-stone-200/60 dark:border-stone-700/60 shadow-sm hover:shadow-md transition-shadow ${isToday ? "ring-2 ring-rust-500/50" : ""}`}>
      <div
        role={onDayClick ? "button" : undefined}
        tabIndex={onDayClick ? 0 : undefined}
        onClick={onDayClick}
        onKeyDown={onDayClick ? (e) => e.key === "Enter" && onDayClick() : undefined}
        className={`shrink-0 px-3 py-2 bg-stone-50/30 dark:bg-stone-800/30 ${onDayClick ? "cursor-pointer hover:bg-stone-100/50 dark:hover:bg-stone-700/50 transition-colors" : ""}`}
      >
        <div className="flex items-center gap-2">
          <div className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-lg font-semibold ${isToday ? "bg-rust-500 text-white" : "bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200"}`}>
            {dayNum}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-medium text-stone-800 dark:text-stone-200 truncate">{dateLabel}</p>
            {showBar && (
              <p className="text-xs text-stone-600 dark:text-stone-400">
                {actualCalories}/{targetCalories} kcal
              </p>
            )}
          </div>
          {isOnTrack && (
            <span className="shrink-0 w-2 h-2 rounded-full bg-blue-500" title="On track" />
          )}
        </div>
        {showBar && (
          <div className="mt-1.5">
            <div className="h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isOver ? "bg-rust-500" : "bg-blue-500"}`}
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            {isOver && (
              <span className="text-[10px] text-rust-600 dark:text-rust-400 font-medium">over</span>
            )}
          </div>
        )}
        {prepMins > 0 && !day.isTakeoutDay && (
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            ~{prepMins} min
          </p>
        )}
      </div>

      <div className="flex-1 p-2 space-y-1.5 overflow-y-auto min-h-0">
        {day.isTakeoutDay ? (
          <>
            {(day.meals ?? [])
              .filter((slot) => slot.isTakeout)
              .map((slot) => (
                <div
                  key={slot.slotIndex}
                  className="rounded-lg p-2 bg-rust-50/60 dark:bg-rust-900/20 border border-rust-200/60 dark:border-rust-800/60"
                >
                  <span className="text-xs font-medium text-rust-700 dark:text-rust-400">
                    {(slot.mealType === "breakfast" ? "Breakfast" : slot.mealType === "lunch" ? "Lunch" : slot.mealType === "dinner" ? "Dinner" : slot.mealType)}: Takeout
                  </span>
                </div>
              ))}
            <TakeoutCard dayName={day.dayName} />
          </>
        ) : (
          day.meals
            .filter((slot) => slot.recipe)
            .map((slot) => (
              <DraggableMealCard
                key={slot.slotIndex}
                slot={slot}
                date={day.date}
                userId={userId}
                weekStart={weekStart}
                onSlotUpdate={onSlotUpdate}
              />
            ))
        )}
      </div>
    </div>
  );
}
