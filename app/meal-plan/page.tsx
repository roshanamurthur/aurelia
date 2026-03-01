import SignOutButton from "@/app/components/SignOutButton";
import { auth } from "@/auth";
import Link from "next/link";
import { getMealPlanData } from "@/lib/meal-plan-api";
import { connectDB } from "@/lib/mongodb";
import type { MealPlanConfig, MealType, SavedMealPlan, WeeklyMealPlan } from "@/lib/types";
import ErrorBanner from "./components/ErrorBanner";
import MealPlanGrid from "./components/MealPlanGrid";

export const dynamic = "force-dynamic";

function getMondayOfWeek(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}

function defaultMealTypes(mealsPerDay: number): MealType[] {
  if (mealsPerDay === 1) return ["dinner"];
  if (mealsPerDay === 2) return ["lunch", "dinner"];
  return ["breakfast", "lunch", "dinner"];
}

export default async function MealPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; numDays?: string; mealsPerDay?: string; startDate?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  const userId = params.userId?.trim() || session?.user?.id || "demo";
  const numDays = Math.min(14, Math.max(1, parseInt(params.numDays ?? "7", 10) || 7));
  const mealsPerDay = [1, 2, 3].includes(parseInt(params.mealsPerDay ?? "3", 10))
    ? parseInt(params.mealsPerDay ?? "3", 10)
    : 3;
  const today = new Date().toISOString().split("T")[0];
  const weekStart = getMondayOfWeek(today);
  const startDate = params.startDate ?? weekStart;

  const mealTypes = defaultMealTypes(mealsPerDay);
  const config: MealPlanConfig = { numDays, mealsPerDay, startDate, mealTypes };

  let plan: SavedMealPlan | WeeklyMealPlan | null = null;
  let error: string | null = null;
  let preferences: { dailyCalorieTarget?: number; dailyProteinTarget?: number } | null = null;

  const [planResult, prefsDoc] = await Promise.all([
    getMealPlanData({ userId, numDays, mealsPerDay, startDate }),
    (async () => {
      try {
        const db = await connectDB();
        return db.collection("user_preferences").findOne({ userId });
      } catch {
        return null;
      }
    })(),
  ]);

  if (planResult.plan) {
    plan = JSON.parse(JSON.stringify(planResult.plan)) as SavedMealPlan;
  } else {
    error = planResult.error ?? "Failed to generate meal plan";
  }

  if (prefsDoc) {
    preferences = {
      dailyCalorieTarget: prefsDoc.dailyCalorieTarget,
      dailyProteinTarget: prefsDoc.dailyProteinTarget,
    };
  }

  const userName = session?.user?.name ?? null;
  const firstName = userName?.split(/\s+/)[0] ?? "there";

  return (
    <div
      className="min-h-screen flex flex-col text-stone-900 dark:text-stone-100 font-sans"
      style={{
        background: "linear-gradient(135deg, #fdfbf8 0%, #f9f5f0 30%, #f5efe8 50%, #f0f5fa 100%)",
      }}
    >
      <header className="bg-white/60 dark:bg-stone-900/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Aurelia</h1>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 transition-colors">
              Preferences
            </Link>
            {session ? (
              <SignOutButton className="text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors bg-transparent border-none cursor-pointer text-sm font-normal">
                Sign out
              </SignOutButton>
            ) : (
              <a href="/login" className="text-rust-600 hover:text-rust-700 dark:text-rust-400 dark:hover:text-rust-300 transition-colors">
                Sign in
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 px-6 py-6">
        <div>
          {plan ? (
              <MealPlanGrid
                plan={plan as WeeklyMealPlan}
                userId={userId}
                weekStart={(plan as SavedMealPlan)?.weekStart ?? getMondayOfWeek(startDate)}
                preferences={preferences}
                startDate={startDate}
                userName={firstName}
                config={config}
              />
            ) : (
              <ErrorBanner message={error ?? "Something went wrong"} />
            )}
        </div>
      </main>
    </div>
  );
}
