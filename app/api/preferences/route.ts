import { connectDB } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

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
