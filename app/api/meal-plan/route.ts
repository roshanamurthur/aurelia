import { getMealPlanData } from "@/lib/meal-plan-api";
import { NextRequest, NextResponse } from "next/server";

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export async function GET(request: NextRequest) {
  try {
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

    const { plan, error } = await getMealPlanData({ userId, numDays, mealsPerDay, startDate });

    if (error) {
      return NextResponse.json({ plan: null, error }, { status: 500 });
    }
    if (!plan) {
      return NextResponse.json({ plan: null, error: "No plan returned" }, { status: 500 });
    }
    return NextResponse.json({ plan: JSON.parse(JSON.stringify(plan)) });
  } catch (err) {
    console.error("Meal plan GET error:", err);
    return NextResponse.json(
      { plan: null, error: err instanceof Error ? err.message : "Meal plan generation failed" },
      { status: 500 }
    );
  }
}
