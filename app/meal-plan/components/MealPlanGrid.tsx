"use client";

import type { DayPlan, MealPlanConfig, WeeklyMealPlan } from "@/lib/types";
import { useState } from "react";
import AgentChatPanel from "./AgentChatPanel";
import DayCard from "./DayCard";
import DayDetailView from "./DayDetailView";
import { MealPlanDndContext } from "./DraggableMealCard";
import GroceryListPanel from "./GroceryListPanel";
import MealPlanControls from "./MealPlanControls";
import SideNav from "./SideNav";
import WeekSummaryCard from "./WeekSummaryCard";

type View = "week" | "day" | "grocery";

interface MealPlanGridProps {
  plan: WeeklyMealPlan;
  userId: string;
  weekStart: string;
  preferences?: { dailyCalorieTarget?: number; dailyProteinTarget?: number } | null;
  startDate: string;
  userName?: string | null;
  config: MealPlanConfig;
}

const DAYS_PER_WEEK = 7;

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

const INITIAL_VISIBLE_DAYS = 7;

/** Keep days in chronological order (startDate, startDate+1, ...). */
function orderWeekDays(days: DayPlan[]): DayPlan[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date));
}

export default function MealPlanGrid({ plan, userId, weekStart, preferences, startDate, userName, config }: MealPlanGridProps) {
  const [view, setView] = useState<View>("week");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [weekIndex, setWeekIndex] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [showAllDays, setShowAllDays] = useState(false);
  const totalWeeks = Math.ceil(plan.days.length / DAYS_PER_WEEK);
  const startIdx = weekIndex * DAYS_PER_WEEK;
  const rawWeekDays = plan.days.slice(startIdx, startIdx + DAYS_PER_WEEK);
  const orderedDays = orderWeekDays(rawWeekDays);
  const allWeekDays = orderedDays;
  const weekDays = showAllDays ? allWeekDays : allWeekDays.slice(0, INITIAL_VISIBLE_DAYS);
  const hasMoreDays = allWeekDays.length > INITIAL_VISIBLE_DAYS && !showAllDays;
  const today = getTodayDate();

  const weeklyNutrition = weekDays.reduce(
    (acc, d) => ({
      calories: acc.calories + (d.nutritionActual?.calories ?? 0),
      protein: acc.protein + (d.nutritionActual?.protein ?? 0),
      carbs: acc.carbs + (d.nutritionActual?.carbs ?? 0),
      fat: acc.fat + (d.nutritionActual?.fat ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const weeklyCalTarget = (preferences?.dailyCalorieTarget ?? 0) > 0
    ? (preferences!.dailyCalorieTarget! * allWeekDays.length) : 0;

  const mealCount = allWeekDays.reduce(
    (acc, d) => acc + (d.meals?.filter((m) => m.recipe).length ?? 0),
    0
  );

  const selectedDay = selectedDate ? plan.days.find((d) => d.date === selectedDate) : null;
  const selectedDayLabel = selectedDay
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(selectedDay.date + "T00:00:00Z"))
    : null;

  const handleDayClick = (date: string) => {
    setSelectedDate(date);
    setView("day");
  };

  const handleNavigate = (v: View) => {
    setView(v);
    if (v === "week") setSelectedDate(null);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[400px]">
      <SideNav
        currentView={view}
        onNavigate={handleNavigate}
        selectedDayLabel={selectedDayLabel}
      />
      <main className="flex-1 min-w-0 flex flex-col pl-8 pr-6">
        {view === "week" && (
          <>
            <div className="mb-4 pb-4 border-b border-stone-200/60 dark:border-stone-700/60 bg-gradient-to-b from-stone-50/50 to-transparent dark:from-stone-900/30 dark:to-transparent -mx-2 px-2 pt-2 rounded-lg">
              <h2 className="font-display text-4xl md:text-5xl font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
                {userName ? `Your week, ${userName}` : "Your week"}
              </h2>
              <p className="text-base text-stone-500 dark:text-stone-400 mt-1">
                Click a day to see meals and prep
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <MealPlanControls initialConfig={config} userId={userId} />
              {totalWeeks > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setWeekIndex((i) => Math.max(0, i - 1))}
                    disabled={weekIndex === 0}
                    className="p-1.5 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
                  >
                    &larr;
                  </button>
                  {Array.from({ length: totalWeeks }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setWeekIndex(i)}
                      className={`px-2 py-1 rounded-lg text-sm font-medium ${i === weekIndex ? "bg-rust-500/80 text-white" : "text-stone-500 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800"}`}
                    >
                      W{i + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setWeekIndex((i) => Math.min(totalWeeks - 1, i + 1))}
                    disabled={weekIndex >= totalWeeks - 1}
                    className="p-1.5 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
                  >
                    &rarr;
                  </button>
                </div>
              )}
            </div>
            <MealPlanDndContext
              weekDays={weekDays}
              userId={userId}
              weekStart={weekStart}
              onSlotUpdate={() => window.dispatchEvent(new CustomEvent("mealplan-refresh"))}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3 pb-6 items-stretch overflow-y-auto">
                {weekDays.map((day) => (
                  <DayCard
                    key={day.date}
                    day={day}
                    userId={userId}
                    weekStart={weekStart}
                    onSlotUpdate={() => window.dispatchEvent(new CustomEvent("mealplan-refresh"))}
                    onDayClick={() => handleDayClick(day.date)}
                  />
                ))}
                {hasMoreDays ? (
                  <button
                    type="button"
                    onClick={() => setShowAllDays(true)}
                    className="w-full min-w-0 rounded-xl border-2 border-dashed border-stone-300 dark:border-stone-600 bg-stone-50/50 dark:bg-stone-900/50 p-6 flex flex-col items-center justify-center gap-2 hover:border-rust-400 hover:bg-rust-50/30 dark:hover:bg-rust-950/20 transition-colors text-stone-600 dark:text-stone-400 hover:text-rust-600 dark:hover:text-rust-400"
                  >
                    <span className="text-2xl">+</span>
                    <span className="text-sm font-medium">Show {allWeekDays.length - INITIAL_VISIBLE_DAYS} more days</span>
                  </button>
                ) : null}
                <WeekSummaryCard
                  calories={weeklyNutrition.calories}
                  protein={weeklyNutrition.protein}
                  carbs={weeklyNutrition.carbs}
                  fat={weeklyNutrition.fat}
                  targetCal={weeklyCalTarget > 0 ? weeklyCalTarget : undefined}
                  mealCount={mealCount}
                  onOpenChat={() => setChatOpen(true)}
                />
              </div>
            </MealPlanDndContext>
          </>
        )}
        {view === "day" && selectedDay && (
          <div className="p-6 max-w-2xl">
            <DayDetailView
              day={selectedDay}
              onBack={() => handleNavigate("week")}
            />
          </div>
        )}
        {view === "grocery" && (
          <div className="p-4">
            <GroceryListPanel days={weekDays} />
          </div>
        )}
      </main>
      {chatOpen && (
        <AgentChatPanel userId={userId} onClose={() => setChatOpen(false)} />
      )}
    </div>
  );
}
