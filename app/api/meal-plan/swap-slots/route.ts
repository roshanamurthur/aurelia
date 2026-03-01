import { connectDB } from "@/lib/mongodb";
import { computeDayNutrition } from "@/lib/planning-engine";
import type { SavedMealPlan } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

/**
 * Swap two meal slots between two days.
 * Body: { userId, weekStart, sourceDate, sourceSlotIndex, targetDate, targetSlotIndex }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = (body.userId as string)?.trim() || "demo";
    const weekStart = body.weekStart as string;
    const sourceDate = body.sourceDate as string;
    const sourceSlotIndex = typeof body.sourceSlotIndex === "number" ? body.sourceSlotIndex : undefined;
    const targetDate = body.targetDate as string;
    const targetSlotIndex = typeof body.targetSlotIndex === "number" ? body.targetSlotIndex : undefined;

    if (!weekStart || !sourceDate || sourceSlotIndex === undefined || !targetDate || targetSlotIndex === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: weekStart, sourceDate, sourceSlotIndex, targetDate, targetSlotIndex" },
        { status: 400 }
      );
    }

    const db = await connectDB();
    const savedPlan = await db.collection<SavedMealPlan>("meal_plans").findOne({
      userId,
      weekStart,
      status: "active",
    });

    if (!savedPlan) {
      return NextResponse.json({ error: "No active plan found" }, { status: 404 });
    }

    const sourceDayIdx = savedPlan.days.findIndex((d) => d.date === sourceDate);
    const targetDayIdx = savedPlan.days.findIndex((d) => d.date === targetDate);
    if (sourceDayIdx === -1 || targetDayIdx === -1) {
      return NextResponse.json({ error: "Date not found in plan" }, { status: 404 });
    }

    const sourceDay = savedPlan.days[sourceDayIdx];
    const targetDay = savedPlan.days[targetDayIdx];
    const sourceSlot = sourceDay.meals[sourceSlotIndex];
    const targetSlot = targetDay.meals[targetSlotIndex];
    if (!sourceSlot || !targetSlot) {
      return NextResponse.json({ error: "Slot index out of range" }, { status: 400 });
    }
    if (sourceSlot.isTakeout || targetSlot.isTakeout) {
      return NextResponse.json({ error: "Cannot swap takeout slots" }, { status: 400 });
    }

    // Swap recipes (keep slot metadata like mealType, slotIndex)
    const sourceMeals = [...sourceDay.meals];
    const targetMeals = [...targetDay.meals];
    const sourceRecipe = sourceSlot.recipe;
    const targetRecipe = targetSlot.recipe;

    sourceMeals[sourceSlotIndex] = { ...sourceSlot, recipe: targetRecipe };
    targetMeals[targetSlotIndex] = { ...targetSlot, recipe: sourceRecipe };

    const updatedSourceNutrition = computeDayNutrition(sourceMeals);
    const updatedTargetNutrition = computeDayNutrition(targetMeals);

    await db.collection<SavedMealPlan>("meal_plans").updateOne(
      { userId, weekStart, status: "active" },
      {
        $set: {
          [`days.${sourceDayIdx}.meals`]: sourceMeals,
          [`days.${sourceDayIdx}.nutritionActual`]: updatedSourceNutrition,
          [`days.${targetDayIdx}.meals`]: targetMeals,
          [`days.${targetDayIdx}.nutritionActual`]: updatedTargetNutrition,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Swap slots error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Swap failed" },
      { status: 500 }
    );
  }
}
