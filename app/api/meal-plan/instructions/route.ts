import { NextRequest, NextResponse } from "next/server";

interface AnalyzedStep {
  number?: number;
  step?: string;
}

interface AnalyzedInstruction {
  name?: string;
  steps?: AnalyzedStep[];
}

/**
 * Fetch recipe instructions from Spoonacular analyzedInstructions endpoint.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const recipeId = searchParams.get("recipeId");
    if (!recipeId) {
      return NextResponse.json({ error: "recipeId required" }, { status: 400 });
    }

    const apiKey = process.env.SPOONACULAR_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "SPOONACULAR_API_KEY not configured" }, { status: 500 });
    }

    const res = await fetch(
      `https://api.spoonacular.com/recipes/${recipeId}/analyzedInstructions?apiKey=${apiKey}`
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch instructions" },
        { status: res.status }
      );
    }

    const data = (await res.json()) as AnalyzedInstruction[];
    const steps = (data[0]?.steps ?? []).map((s) => s.step ?? "").filter(Boolean);
    return NextResponse.json({ steps });
  } catch (err) {
    console.error("Instructions error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch instructions" },
      { status: 500 }
    );
  }
}
