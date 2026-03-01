import { connectDB } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_KEYS = [
  "excludeIngredients", "includeIngredients", "preferredCuisines", "excludeCuisine",
  "diet", "intolerances", "calorieRange", "proteinTarget", "carbRange", "fatRange",
  "sodiumRange", "sugarRange", "maxReadyTime", "mealTypes", "equipment", "servingRange",
  "query", "sortPreference", "sortDirection", "takeoutDays",
  "dailyCalorieTarget", "dailyProteinTarget", "dailyCarbTarget", "dailyFatTarget",
] as const;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "demo";

    if (!process.env.MONGODB_URI) {
      return NextResponse.json({ preferences: null });
    }

    const db = await connectDB();
    const doc = await db
      .collection("user_preferences")
      .findOne({ userId });

    if (!doc) {
      return NextResponse.json({ preferences: null });
    }

    const { _id, ...preferences } = doc;
    return NextResponse.json({ preferences });
  } catch (err) {
    console.error("Preferences fetch error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "demo";

    if (!process.env.MONGODB_URI) {
      return NextResponse.json({ error: "No database configured" }, { status: 500 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_KEYS) {
      if (key in body) {
        const val = body[key];
        if (key === "calorieRange" || key === "carbRange" || key === "fatRange" || key === "sodiumRange" || key === "sugarRange" || key === "servingRange") {
          if (val && typeof val === "object" && "min" in val && "max" in val) {
            updates[key] = { min: Number(val.min) || 0, max: Number(val.max) || 0 };
          }
        } else if (Array.isArray(val)) {
          updates[key] = val.filter((x) => typeof x === "string");
        } else if (typeof val === "number" && val >= 0) {
          updates[key] = val;
        } else if (typeof val === "string") {
          updates[key] = val.trim();
        }
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const db = await connectDB();
    const now = new Date();
    const result = await db.collection("user_preferences").findOneAndUpdate(
      { userId },
      { $set: { ...updates, updatedAt: now } },
      { upsert: true, returnDocument: "after" }
    );
    const doc = result;
    if (!doc) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    const { _id, ...preferences } = doc;
    return NextResponse.json({ preferences });
  } catch (err) {
    console.error("Preferences patch error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "demo";

    if (!process.env.MONGODB_URI) {
      return NextResponse.json({ deleted: false, message: "No database configured" });
    }

    const db = await connectDB();
    const result = await db.collection("user_preferences").deleteOne({ userId });
    return NextResponse.json({ deleted: result.deletedCount > 0 });
  } catch (err) {
    console.error("Preferences delete error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 }
    );
  }
}
