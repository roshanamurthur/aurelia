import { connectDB } from "@/lib/mongodb";
import { toSpoonacularParams } from "@/lib/spoonacular";
import type {
  DayPlan,
  MealPlanApiResponse,
  MealSlot,
  SpoonacularRecipe,
  UserPreferences,
  WeeklyMealPlan,
} from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

function getDayName(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][d.getUTCDay()];
}

export async function GET(request: NextRequest): Promise<NextResponse<MealPlanApiResponse>> {
  try {
    // Step 1: Parse and validate query params
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId")?.trim() || "demo";
    const numDaysRaw = parseInt(searchParams.get("numDays") ?? "7", 10);
    const numDays = isNaN(numDaysRaw) ? 7 : Math.min(14, Math.max(1, numDaysRaw));
    const mpdRaw = parseInt(searchParams.get("mealsPerDay") ?? "3", 10);
    if (![1, 2, 3].includes(mpdRaw)) {
      return NextResponse.json({ plan: null, error: "mealsPerDay must be 1, 2, or 3" }, { status: 400 });
    }
    const mealsPerDay = mpdRaw;
    const startDate = searchParams.get("startDate") ?? todayISO();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return NextResponse.json({ plan: null, error: "startDate must be YYYY-MM-DD" }, { status: 400 });
    }

    // Step 2: Fetch user preferences from MongoDB
    const db = await connectDB();
    const prefs = await db.collection<UserPreferences>("user_preferences").findOne({ userId });

    // Step 3: Build day stubs
    const days: DayPlan[] = Array.from({ length: numDays }, (_, i) => {
      const date = addDays(startDate, i);
      const dayName = getDayName(date);
      const isTakeoutDay = prefs?.takeoutDays?.includes(dayName) ?? false;
      return { date, dayName, isTakeoutDay, meals: [] };
    });

    // Step 4: Batch Spoonacular request
    const nonTakeoutDays = days.filter((d) => !d.isTakeoutDay);
    const totalSlotsNeeded = nonTakeoutDays.length * mealsPerDay;
    let recipes: SpoonacularRecipe[] = [];

    if (totalSlotsNeeded > 0) {
      const apiKey = process.env.SPOONACULAR_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ plan: null, error: "SPOONACULAR_API_KEY is not configured" }, { status: 500 });
      }

      // Build params from prefs but drop includeIngredients (too restrictive as hard filter)
      // and instead move it to the query field as a soft preference
      const baseParams = toSpoonacularParams(prefs);
      const softQuery = [
        baseParams.includeIngredients ? String(baseParams.includeIngredients).replace(/,/g, " ") : "",
        baseParams.query ? String(baseParams.query) : "",
      ].filter(Boolean).join(" ").trim();

      delete baseParams.includeIngredients;
      if (softQuery) baseParams.query = softQuery;
      baseParams.instructionsRequired = true;

      const buildUrl = (overrides: Record<string, string | number | boolean>) => {
        const merged = { ...baseParams, apiKey, ...overrides };
        const qs = new URLSearchParams(
          Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, String(v)]))
        ).toString();
        return `https://api.spoonacular.com/recipes/complexSearch?${qs}`;
      };

      const randomOffset = Math.floor(Math.random() * 50);

      // Primary call: full constraints, random offset for variety
      try {
        const primaryUrl = buildUrl({ number: 100, offset: randomOffset });
        const res1 = await fetch(primaryUrl);
        if (res1.ok) {
          const json1 = await res1.json();
          recipes = (json1.results ?? []) as SpoonacularRecipe[];
        } else {
          console.error("Spoonacular primary call failed:", res1.status);
        }
      } catch (e) {
        console.error("Spoonacular primary call error:", e);
      }

      // Fallback: if not enough unique recipes, drop cuisine constraint and retry
      if (recipes.length < totalSlotsNeeded) {
        try {
          const relaxedParams = { ...baseParams };
          delete relaxedParams.cuisine;
          delete relaxedParams.excludeCuisine;
          const relaxedMerged = { ...relaxedParams, apiKey, number: 100, offset: Math.floor(Math.random() * 100) };
          const qs = new URLSearchParams(
            Object.fromEntries(Object.entries(relaxedMerged).map(([k, v]) => [k, String(v)]))
          ).toString();
          const fallbackUrl = `https://api.spoonacular.com/recipes/complexSearch?${qs}`;
          const res2 = await fetch(fallbackUrl);
          if (res2.ok) {
            const json2 = await res2.json();
            const extra = (json2.results ?? []) as SpoonacularRecipe[];
            // Merge: add recipes not already in the pool (by id)
            const existingIds = new Set(recipes.map((r) => r.id));
            for (const r of extra) {
              if (!existingIds.has(r.id)) {
                recipes.push(r);
                existingIds.add(r.id);
              }
            }
          }
        } catch (e) {
          console.error("Spoonacular fallback call error:", e);
        }
      }
    }

    // Step 5: Distribute recipes into meal slots
    const usedIds = new Set<number>();
    let poolIndex = 0;

    for (const day of days) {
      if (day.isTakeoutDay) {
        day.meals = Array.from({ length: mealsPerDay }, (_, i): MealSlot => ({
          slotIndex: i,
          type: "takeout",
          recipe: null,
          isTakeout: true,
        }));
      } else {
        day.meals = Array.from({ length: mealsPerDay }, (_, i): MealSlot => {
          let found: SpoonacularRecipe | null = null;
          let attempts = 0;
          while (attempts < recipes.length) {
            const candidate = recipes[poolIndex % recipes.length];
            poolIndex++;
            attempts++;
            if (!usedIds.has(candidate.id)) {
              found = candidate;
              usedIds.add(candidate.id);
              break;
            }
          }
          if (!found && recipes.length > 0) {
            found = recipes[poolIndex % recipes.length];
            poolIndex++;
          }
          return {
            slotIndex: i,
            type: found ? "recipe" : "empty",
            recipe: found ?? null,
            isTakeout: false,
          };
        });
      }
    }

    // Step 6: Assemble and return
    const plan: WeeklyMealPlan = {
      userId,
      config: { numDays, mealsPerDay, startDate },
      days,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ plan } satisfies MealPlanApiResponse);
  } catch (err) {
    console.error("Meal plan error:", err);
    return NextResponse.json(
      { plan: null, error: err instanceof Error ? err.message : "Meal plan generation failed" },
      { status: 500 }
    );
  }
}
