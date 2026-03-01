/**
 * One-time seed: insert a meal plan for dishagupta830@gmail.com with a takeout day (Friday).
 * Visit GET /api/admin/seed-disha-plan to run.
 */
import { connectDB } from "@/lib/mongodb";
import { generateWeeklyPlan, toSavedMealPlan } from "@/lib/planning-engine";
import type { MealPlanConfig, SavedMealPlan, UserPreferences } from "@/lib/types";
import { NextResponse } from "next/server";

const SEED_EMAIL = "dishagupta830@gmail.com";

function getMondayOfWeek(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}

export async function GET() {
  try {
    const apiKey = process.env.SPOONACULAR_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "SPOONACULAR_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const db = await connectDB();

    // Resolve userId: prefer auth_users._id if user exists, else use email
    let userId = SEED_EMAIL;
    const authUser = await db.collection("auth_users").findOne({ email: SEED_EMAIL });
    if (authUser?._id) {
      userId = String(authUser._id);
    }

    const weekStart = getMondayOfWeek(new Date().toISOString().split("T")[0]);

    const prefs: UserPreferences = {
      userId,
      excludeIngredients: [],
      preferredCuisines: [],
      excludeCuisine: [],
      diet: "",
      intolerances: [],
      calorieRange: { min: 0, max: 0 },
      proteinTarget: 0,
      carbRange: { min: 0, max: 999 },
      fatRange: { min: 0, max: 999 },
      sodiumRange: { min: 0, max: 9999 },
      sugarRange: { min: 0, max: 999 },
      maxReadyTime: 0,
      mealTypes: [],
      equipment: [],
      servingRange: { min: 0, max: 0 },
      query: "",
      sortPreference: "",
      sortDirection: "asc",
      takeoutDays: ["friday"],
      swapHistory: [],
      dailyCalorieTarget: 2000,
      dailyProteinTarget: 0,
      dailyCarbTarget: 0,
      dailyFatTarget: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const config: MealPlanConfig = {
      numDays: 7,
      mealsPerDay: 3,
      startDate: weekStart,
      mealTypes: ["breakfast", "lunch", "dinner"],
    };

    const plan = await generateWeeklyPlan(userId, prefs, config, apiKey);
    const saved: SavedMealPlan = toSavedMealPlan(plan, weekStart, prefs, 1);
    if (authUser?.email) {
      (saved as SavedMealPlan & { userEmail?: string }).userEmail = authUser.email as string;
    }

    // Archive any existing active plan for this userId + weekStart
    await db.collection<SavedMealPlan>("meal_plans").updateMany(
      { userId, weekStart, status: "active" },
      { $set: { status: "archived", updatedAt: new Date().toISOString() } }
    );

    await db.collection<SavedMealPlan>("meal_plans").insertOne(saved);

    // Upsert user_preferences so future plan generation includes takeout
    await db.collection("user_preferences").updateOne(
      { userId },
      {
        $set: {
          userId,
          takeoutDays: ["friday"],
          dailyCalorieTarget: 2000,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({
      ok: true,
      userId,
      weekStart,
      message: `Meal plan seeded. View at /meal-plan${userId === SEED_EMAIL ? `?userId=dishagupta830@gmail.com` : ""}`,
    });
  } catch (err) {
    console.error("seed-disha-plan error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Seed failed",
      },
      { status: 500 }
    );
  }
}
