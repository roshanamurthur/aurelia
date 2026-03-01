import { NextRequest, NextResponse } from "next/server";

interface SpoonacularIngredient {
  id?: number;
  name?: string;
  amount?: number;
  unit?: string;
  original?: string;
}

interface SpoonacularRecipeInfo {
  title?: string;
  extendedIngredients?: SpoonacularIngredient[];
  readyInMinutes?: number;
}

const STORE_SECTIONS = ["Produce", "Dairy & Eggs", "Meat & Seafood", "Pantry", "Baking", "Frozen", "Other"] as const;

function categorizeIngredient(name: string): (typeof STORE_SECTIONS)[number] {
  const n = name.toLowerCase();
  const produce = /\b(onion|garlic|tomato|potato|carrot|celery|bell pepper|pepper|lettuce|spinach|kale|broccoli|cauliflower|zucchini|cucumber|mushroom|ginger|lemon|lime|apple|banana|orange|avocado|herb|basil|parsley|cilantro|mint|thyme|rosemary|oregano|scallion|green onion)\b/;
  const dairy = /\b(milk|cheese|yogurt|butter|cream|egg)\b/;
  const meat = /\b(chicken|beef|pork|fish|salmon|shrimp|bacon|turkey|lamb)\b/;
  const baking = /\b(flour|sugar|baking powder|baking soda|vanilla|cinnamon|nutmeg|cocoa|chocolate)\b/;
  const frozen = /\b(frozen|ice)\b/;
  const pantry = /\b(rice|pasta|noodle|oil|vinegar|soy sauce|broth|stock|canned|beans|lentil|quinoa|oat|nut|seed|honey|maple|salsa|sauce)\b/;
  if (produce.test(n)) return "Produce";
  if (dairy.test(n)) return "Dairy & Eggs";
  if (meat.test(n)) return "Meat & Seafood";
  if (baking.test(n)) return "Baking";
  if (frozen.test(n)) return "Frozen";
  if (pantry.test(n)) return "Pantry";
  return "Other";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const recipeIds = (body.recipeIds as number[]) ?? [];

    const apiKey = process.env.SPOONACULAR_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "SPOONACULAR_API_KEY not configured" }, { status: 500 });
    }

    const ingredients: { name: string; amount: string; recipes: string[] }[] = [];
    const seen = new Map<string, { amount: string; recipes: Set<string> }>();

    for (const id of recipeIds) {
      const res = await fetch(
        `https://api.spoonacular.com/recipes/${id}/information?includeNutrition=false&apiKey=${apiKey}`
      );
      if (!res.ok) continue;
      const data = (await res.json()) as SpoonacularRecipeInfo;
      const recipeName = data.title ?? `Recipe ${id}`;
      const ext = data.extendedIngredients ?? [];

      for (const ing of ext) {
        const amt = ing.amount != null ? String(ing.amount) : "";
        const u = ing.unit != null ? String(ing.unit) : "";
        const built = ing.name ? `${amt} ${u} ${ing.name}`.trim() : "";
        const raw = ing.original != null && ing.original !== "" ? ing.original : (built || "Unknown");
        const display = raw.trim();
        if (!display) continue;
        const key = display.toLowerCase();
        if (!seen.has(key)) {
          seen.set(key, { amount: display, recipes: new Set([recipeName]) });
        } else {
          seen.get(key)!.recipes.add(recipeName);
        }
      }
    }

    const flatList = Array.from(seen.entries()).map(([name, { amount, recipes }]) => ({
      name,
      amount,
      recipes: Array.from(recipes),
      section: categorizeIngredient(name),
    }));

    const bySection = STORE_SECTIONS.reduce((acc, sec) => {
      acc[sec] = flatList.filter((i) => i.section === sec);
      return acc;
    }, {} as Record<(typeof STORE_SECTIONS)[number], typeof flatList>);

    return NextResponse.json({ ingredients: flatList, bySection });
  } catch (err) {
    console.error("Grocery list error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate grocery list" },
      { status: 500 }
    );
  }
}
