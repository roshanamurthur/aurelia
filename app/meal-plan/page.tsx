import { Suspense } from "react";
import MealPlanControls from "./components/MealPlanControls";
import MealPlanGrid from "./components/MealPlanGrid";
import LoadingGrid from "./components/LoadingGrid";
import ErrorBanner from "./components/ErrorBanner";
import type { MealPlanApiResponse, MealPlanConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MealPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; numDays?: string; mealsPerDay?: string; startDate?: string }>;
}) {
  const params = await searchParams;
  const userId = params.userId?.trim() || "demo";
  const numDays = Math.min(14, Math.max(1, parseInt(params.numDays ?? "7", 10) || 7));
  const mealsPerDay = [1, 2, 3].includes(parseInt(params.mealsPerDay ?? "3", 10))
    ? parseInt(params.mealsPerDay ?? "3", 10)
    : 3;
  const startDate = params.startDate ?? new Date().toISOString().split("T")[0];

  const config: MealPlanConfig = { numDays, mealsPerDay, startDate };

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3005";
  const url = `${baseUrl}/api/meal-plan?userId=${userId}&numDays=${numDays}&mealsPerDay=${mealsPerDay}&startDate=${startDate}`;

  let plan = null;
  let error: string | null = null;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data: MealPlanApiResponse = await res.json();
    if (data.plan) plan = data.plan;
    else error = data.error ?? "Failed to generate meal plan";
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch meal plan";
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Aurelia</h1>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
              Your weekly meal plan
            </p>
          </div>
          <a
            href="/"
            className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
          >
            &larr; Preferences
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <MealPlanControls initialConfig={config} userId={userId} />

        <div className="mt-8">
          <Suspense fallback={<LoadingGrid numDays={numDays} mealsPerDay={mealsPerDay} />}>
            {plan ? (
              <MealPlanGrid plan={plan} />
            ) : (
              <ErrorBanner message={error ?? "Something went wrong"} />
            )}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
