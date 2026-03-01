/**
 * Verification endpoint: lists meal plans with their associated user info.
 * Use this to confirm each authorized user has separate meal plans.
 *
 * GET /api/admin/verify-meal-plans
 *   Returns: { mealPlans: [...], authUsers: [...], summary }
 *
 * POST /api/admin/verify-meal-plans
 *   Backfills userEmail on existing meal plans (for MongoDB visibility).
 */
import { resolveUserEmail } from "@/lib/meal-plan-api";
import { connectDB } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

function isObjectIdString(s: string): boolean {
  return /^[a-f0-9]{24}$/i.test(s);
}

export async function GET() {
  try {
    const db = await connectDB();

    type MealPlanProjection = { userId: string; userEmail?: string; weekStart?: string; status?: string; generatedAt?: string };
    type AuthUserDoc = { _id: { toString: () => string }; email?: string; name?: string };

    const [mealPlansRaw, authUsers] = await Promise.all([
      db
        .collection("meal_plans")
        .find({})
        .project({ userId: 1, userEmail: 1, weekStart: 1, status: 1, generatedAt: 1, _id: 0 })
        .sort({ userId: 1, weekStart: -1 })
        .toArray(),
      db
        .collection("auth_users")
        .find({})
        .project({ _id: 1, email: 1, name: 1 })
        .toArray(),
    ]);

    const mealPlans = mealPlansRaw as MealPlanProjection[];
    const authUsersFormatted = (authUsers as AuthUserDoc[]).map((u) => ({
      userId: String(u._id),
      email: u.email ?? null,
      name: u.name ?? null,
    }));

    return NextResponse.json({
      mealPlans,
      authUsers: authUsersFormatted,
      summary: {
        totalMealPlans: mealPlans.length,
        totalAuthUsers: authUsersFormatted.length,
        uniqueUserIdsInPlans: [...new Set(mealPlans.map((p) => p.userId))].length,
      },
    });
  } catch (err) {
    console.error("verify-meal-plans error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action === "backfill" ? "backfill" : null;
    if (action !== "backfill") {
      return NextResponse.json({ error: "Use { action: 'backfill' } to backfill userEmail on existing plans" }, { status: 400 });
    }

    const db = await connectDB();
    const plans = await db.collection("meal_plans").find({}).toArray();
    let updated = 0;

    for (const plan of plans) {
      const userId = plan.userId as string;
      if (!userId || userId === "demo" || !isObjectIdString(userId)) continue;
      if (plan.userEmail) continue; // already has email

      const userEmail = await resolveUserEmail(db, userId);
      if (!userEmail) continue;

      await db.collection("meal_plans").updateOne(
        { _id: plan._id },
        { $set: { userEmail } }
      );
      updated++;
    }

    return NextResponse.json({ ok: true, updated, total: plans.length });
  } catch (err) {
    console.error("verify-meal-plans backfill error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backfill failed" },
      { status: 500 }
    );
  }
}
