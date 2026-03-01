"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import Link from "next/link";
import SignOutButton from "@/app/components/SignOutButton";
import Chat from "@/app/components/Chat";
import TakeoutOrderButton from "@/app/components/TakeoutOrderButton";
import { useState } from "react";

export default function MealPlanPage() {
  const { isLoading } = useConvexAuth();
  const activePlan = useQuery(api.mealPlans.getActivePlan);
  const [chatOpen, setChatOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#fdfbf8] via-[#f9f5f0] to-[#f5efe8]">
        <div className="flex gap-2">
          <span className="w-2 h-2 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const mealTypes = ["breakfast", "lunch", "dinner"];

  const getMeal = (day: string, mealType: string) => {
    if (!activePlan?.meals) return null;
    return activePlan.meals.find(
      (m: any) => m.day === day && m.mealType === mealType && !m.isSkipped
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-[#fdfbf8] via-[#f9f5f0] to-[#f5efe8] dark:from-stone-950 dark:via-stone-900 dark:to-stone-950">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-white/80 dark:bg-stone-900/80 backdrop-blur-md border-b border-stone-200/60 dark:border-stone-800 shrink-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2">
                <img src="/icon.svg" alt="Aurelia" className="w-8 h-8" />
                <span className="font-display text-xl font-semibold text-stone-800 dark:text-stone-100">Aurelia</span>
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <TakeoutOrderButton variant="button" />
              <Link
                href="/"
                className="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 hover:text-stone-800 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-800 transition-colors"
              >
                Home
              </Link>
              <SignOutButton className="px-4 py-2 rounded-xl text-sm font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800 transition-colors">
                Sign out
              </SignOutButton>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            {!activePlan ? (
              <div className="text-center py-20">
                <h2 className="font-display text-2xl font-semibold text-stone-800 dark:text-stone-100 mb-4">
                  No meal plan yet
                </h2>
                <p className="text-stone-500 dark:text-stone-400 mb-8 max-w-md mx-auto">
                  Head back to the chat and tell Aurelia about your dietary preferences. She&apos;ll generate a personalized meal plan for you.
                </p>
                <Link
                  href="/"
                  className="inline-flex px-6 py-3 rounded-xl bg-rust-500/90 hover:bg-rust-600 text-white font-medium transition-colors shadow-sm"
                >
                  Start planning
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <h1 className="font-display text-2xl font-semibold text-stone-800 dark:text-stone-100 mb-1">
                    Your Meal Plan
                  </h1>
                  <p className="text-stone-500 dark:text-stone-400">
                    Week of {activePlan.weekStartDate}
                  </p>
                </div>

                {/* Meal plan grid */}
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-[auto_repeat(7,minmax(140px,1fr))] gap-2 min-w-[900px]">
                    {/* Header row */}
                    <div className="p-2" />
                    {days.map((day) => (
                      <div
                        key={day}
                        className="p-3 text-center font-semibold text-stone-700 dark:text-stone-300 capitalize bg-white/60 dark:bg-stone-800/40 rounded-xl"
                      >
                        {day}
                      </div>
                    ))}

                    {/* Meal type rows */}
                    {mealTypes.map((mealType) => (
                      <>
                        <div
                          key={`label-${mealType}`}
                          className="p-3 flex items-center font-semibold text-stone-600 dark:text-stone-400 capitalize text-sm"
                        >
                          {mealType}
                        </div>
                        {days.map((day) => {
                          const meal = getMeal(day, mealType);
                          return (
                            <div
                              key={`${day}-${mealType}`}
                              className="rounded-xl border border-stone-200/60 dark:border-stone-700/50 bg-white/80 dark:bg-stone-800/60 p-3 min-h-[120px] flex flex-col"
                            >
                              {meal ? (
                                <>
                                  {meal.recipeImageUrl && (
                                    <img
                                      src={meal.recipeImageUrl}
                                      alt={meal.recipeName}
                                      className="w-full h-20 object-cover rounded-lg mb-2"
                                    />
                                  )}
                                  <p className="text-sm font-medium text-stone-800 dark:text-stone-200 line-clamp-2 flex-1">
                                    {meal.recipeName}
                                  </p>
                                  {meal.calories && (
                                    <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                                      {Math.round(meal.calories)} cal
                                    </p>
                                  )}
                                </>
                              ) : (
                                <TakeoutOrderButton variant="card" />
                              )}
                            </div>
                          );
                        })}
                      </>
                    ))}
                  </div>
                </div>

                {/* Nutrition summary */}
                {activePlan.meals && activePlan.meals.length > 0 && (
                  <div className="mt-8 p-6 rounded-2xl bg-white/80 dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/50">
                    <h3 className="font-semibold text-stone-800 dark:text-stone-200 mb-4">Weekly Summary</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {(() => {
                        const nonSkipped = activePlan.meals.filter((m: any) => !m.isSkipped);
                        const totalCal = nonSkipped.reduce((s: number, m: any) => s + (m.calories || 0), 0);
                        const totalProtein = nonSkipped.reduce((s: number, m: any) => s + (m.protein || 0), 0);
                        const totalCarbs = nonSkipped.reduce((s: number, m: any) => s + (m.carbs || 0), 0);
                        const totalFat = nonSkipped.reduce((s: number, m: any) => s + (m.fat || 0), 0);
                        const numDays = new Set(nonSkipped.map((m: any) => m.day)).size || 1;
                        return (
                          <>
                            <div className="text-center">
                              <p className="text-2xl font-semibold text-rust-600">{Math.round(totalCal / numDays)}</p>
                              <p className="text-xs text-stone-500 mt-1">cal/day avg</p>
                            </div>
                            <div className="text-center">
                              <p className="text-2xl font-semibold text-blue-600">{Math.round(totalProtein / numDays)}g</p>
                              <p className="text-xs text-stone-500 mt-1">protein/day</p>
                            </div>
                            <div className="text-center">
                              <p className="text-2xl font-semibold text-amber-600">{Math.round(totalCarbs / numDays)}g</p>
                              <p className="text-xs text-stone-500 mt-1">carbs/day</p>
                            </div>
                            <div className="text-center">
                              <p className="text-2xl font-semibold text-green-600">{Math.round(totalFat / numDays)}g</p>
                              <p className="text-xs text-stone-500 mt-1">fat/day</p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Chat panel — desktop sidebar */}
      {chatOpen && (
        <aside className="hidden md:flex w-96 shrink-0 flex-col border-l border-stone-200/60 dark:border-stone-800 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md">
          <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-stone-200/60 dark:border-stone-800">
            <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Chat with Aurelia</h2>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="w-8 h-8 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center transition-colors"
            >
              &times;
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Chat variant="panel" placeholder="Swap Thursday dinner to pasta..." />
          </div>
        </aside>
      )}

      {/* Chat panel — mobile full-width overlay */}
      {chatOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md flex flex-col">
          <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-stone-200/60 dark:border-stone-800">
            <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Chat with Aurelia</h2>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="w-8 h-8 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center transition-colors"
            >
              &times;
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Chat variant="panel" placeholder="Swap Thursday dinner to pasta..." />
          </div>
        </div>
      )}

      {/* Floating toggle button */}
      {!chatOpen && (
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 px-5 py-3 rounded-full bg-rust-500/90 hover:bg-rust-600 text-white font-medium text-sm shadow-lg shadow-rust-500/25 transition-all active:scale-[0.97] flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Chat with Aurelia
        </button>
      )}
    </div>
  );
}
