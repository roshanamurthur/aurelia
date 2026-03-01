import { connectDB } from "@/lib/mongodb";
import type { ExtractedConstraints, UserPreferences } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Priority: AURELIA_LLM_API_KEY > XAI_API_KEY (Grok) > OPENAI_API_KEY (from .env.local, loaded with override)
function getLLMClient(): { client: OpenAI; model: string } {
  const aureliaKey = process.env.AURELIA_LLM_API_KEY?.trim();
  const xaiKey = process.env.XAI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  if (aureliaKey) {
    return {
      client: new OpenAI({ apiKey: aureliaKey }),
      model: "gpt-4o-mini",
    };
  }
  if (xaiKey) {
    return {
      client: new OpenAI({
        apiKey: xaiKey,
        baseURL: "https://api.x.ai/v1",
      }),
      model: "grok-3-mini",
    };
  }
  if (openaiKey) {
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      model: "gpt-4o-mini",
    };
  }
  throw new Error("No LLM API key. Set AURELIA_LLM_API_KEY, XAI_API_KEY, or OPENAI_API_KEY in .env.local");
}

const INTAKE_EXAMPLE = `Example input: "I want high protein, under 600 cal per meal, no mushrooms, Mediterranean 2x a week, DoorDash on Fridays. Also 30 min or less, use leftover chicken, no Italian, low carb."

Example output:
{
  "excludeIngredients": ["mushrooms"],
  "includeIngredients": ["chicken"],
  "preferredCuisines": ["mediterranean"],
  "excludeCuisine": ["italian"],
  "diet": "",
  "intolerances": [],
  "calorieRange": { "min": 0, "max": 600 },
  "proteinTarget": 40,
  "carbRange": { "min": 0, "max": 50 },
  "fatRange": { "min": 0, "max": 999 },
  "sodiumRange": { "min": 0, "max": 9999 },
  "sugarRange": { "min": 0, "max": 999 },
  "maxReadyTime": 30,
  "mealTypes": [],
  "equipment": [],
  "servingRange": { "min": 0, "max": 0 },
  "query": "",
  "sortPreference": "",
  "sortDirection": "asc",
  "takeoutDays": ["friday"]
}`;

const INTAKE_SYSTEM_PROMPT = `You are an intake agent for a meal planning app. Extract EVERY possible preference from the user's natural language. Output maps directly to Spoonacular API filters. Do not skip or omit anything the user mentions.

CRITICAL: Extract every single detail. If the user says "no mushrooms", include mushrooms in excludeIngredients. If they say "under 600 cal", set calorieRange.max to 600. If they say "Mediterranean 2x a week", add mediterranean to preferredCuisines. If they say "DoorDash on Fridays", add friday to takeoutDays. If they say "30 min or less", set maxReadyTime to 30. If they say "use leftover chicken", add chicken to includeIngredients. If they say "no Italian", add italian to excludeCuisine. If they say "low carb", set carbRange max to 50. If they say "high protein", set proteinTarget to 40. Capture EVERYTHING.

Output a JSON object with these fields (use empty arrays/strings/0 when not specified):

INGREDIENTS:
- excludeIngredients: string[] - ingredients to avoid (e.g. mushrooms, dairy)
- includeIngredients: string[] - ingredients to use/leftovers (e.g. "use leftover chicken", "I have tomatoes" -> ["chicken"], ["tomatoes"])

CUISINE:
- preferredCuisines: string[] - cuisines they like. Use: african, asian, american, british, cajun, caribbean, chinese, eastern european, european, french, german, greek, indian, irish, italian, japanese, jewish, korean, latin american, mediterranean, mexican, middle eastern, nordic, southern, world
- excludeCuisine: string[] - cuisines to avoid ("no Italian" -> ["italian"]). Same list as above.

DIET & INTOLERANCES:
- diet: string - one of: "", "vegetarian", "vegan", "ketogenic", "paleo", "whole30", "gluten free", "pescetarian", "grain free", "dairy free", "high protein", "low sodium", "low carb", "fodmap", "primal"
- intolerances: string[] - allergens. Use: dairy, egg, gluten, grain, peanut, seafood, sesame, shellfish, soy, sulfite, tree nut, wheat

NUTRITION (per serving):
- calorieRange: { min: number, max: number } - e.g. "under 600" -> { min: 0, max: 600 }, "400-600" -> { min: 400, max: 600 }
- proteinTarget: number - grams. "high protein" -> 40, "low protein" -> 15, "50g protein" -> 50
- carbRange: { min: number, max: number } - grams. "low carb" -> { min: 0, max: 50 }, "keto" -> { min: 0, max: 25 }
- fatRange: { min: number, max: number } - grams. "low fat" -> { min: 0, max: 20 }
- sodiumRange: { min: number, max: number } - mg. "low sodium" -> { min: 0, max: 400 }
- sugarRange: { min: number, max: number } - grams. "low sugar" -> { min: 0, max: 15 }

TIME & MEAL:
- maxReadyTime: number - max minutes to cook. "30 min or less" -> 30, "quick" -> 30, "under an hour" -> 60. 0 = not set.
- mealTypes: string[] - meal types. Use: main course, side dish, appetizer, salad, soup, breakfast, snack, drink, sauce, dessert. "breakfast ideas" -> ["breakfast"], "dinner" -> ["main course"]

EQUIPMENT:
- equipment: string[] - equipment user has or wants to use. Use: baking sheet, blender, frying pan, oven, bowl, saucepan, grill, microwave, food processor, knife, cutting board. "only have a blender" -> ["blender"]

SERVINGS:
- servingRange: { min: number, max: number } - "feeds 4" -> { min: 4, max: 4 }, "just for me" -> { min: 1, max: 1 }. 0 = not set.

SEARCH & SORT:
- query: string - general keywords (e.g. "chicken", "pasta", "salads")
- sortPreference: string - one of: "", "popularity", "healthiness", "price", "time", "calories", "protein". "healthiest" -> "calories", "quickest" -> "time", "most popular" -> "popularity"
- sortDirection: "asc" | "desc" - "asc" for lower/better (calories, time), "desc" for higher (popularity)

TAKEOUT:
- takeoutDays: string[] - days for delivery (e.g. ["friday", "saturday"]). Lowercase. "DoorDash on Fridays" -> ["friday"]

${INTAKE_EXAMPLE}`;

function getDefaultConstraints(): ExtractedConstraints {
  return {
    excludeIngredients: [],
    includeIngredients: [],
    preferredCuisines: [],
    excludeCuisine: [],
    diet: "",
    intolerances: [],
    calorieRange: { min: 0, max: 800 },
    proteinTarget: 25,
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
    takeoutDays: [],
  };
}

function ensureRange(
  val: unknown,
  defaultMax: number
): { min: number; max: number } {
  if (val && typeof val === "object" && "min" in val && "max" in val) {
    const r = val as { min: unknown; max: unknown };
    return {
      min: typeof r.min === "number" ? r.min : 0,
      max: typeof r.max === "number" ? r.max : defaultMax,
    };
  }
  return { min: 0, max: defaultMax };
}

export async function POST(request: NextRequest) {
  try {
    const { text, userId = "demo" } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'text' field" },
        { status: 400 }
      );
    }

    const { client, model } = getLLMClient();

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: INTAKE_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "No response from LLM" },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(content);
    const extracted: ExtractedConstraints = {
      ...getDefaultConstraints(),
      ...parsed,
    };

    // Normalize arrays
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    extracted.excludeIngredients = arr(extracted.excludeIngredients);
    extracted.includeIngredients = arr(extracted.includeIngredients);
    extracted.preferredCuisines = arr(extracted.preferredCuisines);
    extracted.excludeCuisine = arr(extracted.excludeCuisine);
    extracted.intolerances = arr(extracted.intolerances);
    extracted.mealTypes = arr(extracted.mealTypes);
    extracted.equipment = arr(extracted.equipment);
    extracted.takeoutDays = arr(extracted.takeoutDays);

    // Normalize ranges
    extracted.calorieRange = ensureRange(parsed.calorieRange, 800);
    extracted.carbRange = ensureRange(parsed.carbRange, 999);
    extracted.fatRange = ensureRange(parsed.fatRange, 999);
    extracted.sodiumRange = ensureRange(parsed.sodiumRange, 9999);
    extracted.sugarRange = ensureRange(parsed.sugarRange, 999);
    extracted.servingRange = ensureRange(parsed.servingRange, 0);

    // Normalize scalars
    extracted.maxReadyTime =
      typeof parsed.maxReadyTime === "number" && parsed.maxReadyTime >= 0
        ? parsed.maxReadyTime
        : 0;
    extracted.proteinTarget =
      typeof parsed.proteinTarget === "number" ? parsed.proteinTarget : 25;
    extracted.query =
      typeof parsed.query === "string" ? parsed.query.trim() : "";
    extracted.sortPreference =
      typeof parsed.sortPreference === "string" ? parsed.sortPreference : "";
    extracted.sortDirection =
      parsed.sortDirection === "desc" ? "desc" : "asc";
    extracted.diet = typeof parsed.diet === "string" ? parsed.diet : "";

    if (!process.env.MONGODB_URI) {
      return NextResponse.json(
        {
          extracted,
          saved: false,
          error: "MONGODB_URI is not configured. Preferences not persisted.",
        },
        { status: 200 }
      );
    }

    const db = await connectDB();
    const collection = db.collection<UserPreferences>("user_preferences");
    const now = new Date();

    const setFields = {
      excludeIngredients: extracted.excludeIngredients,
      includeIngredients: extracted.includeIngredients,
      preferredCuisines: extracted.preferredCuisines,
      excludeCuisine: extracted.excludeCuisine,
      diet: extracted.diet,
      intolerances: extracted.intolerances,
      calorieRange: extracted.calorieRange,
      proteinTarget: extracted.proteinTarget,
      carbRange: extracted.carbRange,
      fatRange: extracted.fatRange,
      sodiumRange: extracted.sodiumRange,
      sugarRange: extracted.sugarRange,
      maxReadyTime: extracted.maxReadyTime,
      mealTypes: extracted.mealTypes,
      equipment: extracted.equipment,
      servingRange: extracted.servingRange,
      query: extracted.query,
      sortPreference: extracted.sortPreference,
      sortDirection: extracted.sortDirection,
      takeoutDays: extracted.takeoutDays,
      updatedAt: now,
    };

    await collection.updateOne(
      { userId },
      {
        $set: setFields,
        $setOnInsert: { userId, swapHistory: [], createdAt: now },
      },
      { upsert: true }
    );

    return NextResponse.json({ extracted, saved: true });
  } catch (err) {
    console.error("Intake error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Intake failed" },
      { status: 500 }
    );
  }
}
