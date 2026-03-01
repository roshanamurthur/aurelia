import { NextRequest, NextResponse } from "next/server";

interface ExtractedIngredient {
  original?: string;
  name?: string;
  amount?: number;
  unit?: string;
}

interface ExtractedRecipe {
  extendedIngredients?: ExtractedIngredient[];
  ingredients?: ExtractedIngredient[];
}

/**
 * Extract recipe ingredients from a URL using Spoonacular's Extract Recipe from Website API.
 * Use when recipe ID doesn't return ingredients (e.g. external source URLs).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = (body.url as string)?.trim();
    if (!url || !url.startsWith("http")) {
      return NextResponse.json({ error: "Valid recipe URL required" }, { status: 400 });
    }

    const apiKey = process.env.SPOONACULAR_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "SPOONACULAR_API_KEY not configured" }, { status: 500 });
    }

    const res = await fetch(
      `https://api.spoonacular.com/recipes/extract?url=${encodeURIComponent(url)}&apiKey=${apiKey}`
    );
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: err || "Failed to extract recipe from URL" },
        { status: res.status }
      );
    }

    const data = (await res.json()) as ExtractedRecipe;
    const ext = data.extendedIngredients ?? data.ingredients ?? [];
    const ingredients = ext.map((i: ExtractedIngredient) => {
      const raw = i.original ?? (i.name ? `${i.amount ?? ""} ${i.unit ?? ""} ${i.name}`.trim() : "Unknown");
      return { name: i.name ?? raw, amount: String(raw).trim() };
    });

    return NextResponse.json({ ingredients });
  } catch (err) {
    console.error("Extract recipe error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to extract recipe" },
      { status: 500 }
    );
  }
}
