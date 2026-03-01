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

const INTAKE_EXAMPLE = `Example input: "I want high protein, under 600 cal per meal, no mushrooms, Mediterranean 2x a week, DoorDash on Fridays. Also 30 min or less, no Italian, low carb."

Example output:
{
  "excludeIngredients": ["mushrooms"],
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
  "takeoutDays": ["friday"],
  "dailyCalorieTarget": 0,
  "dailyProteinTarget": 0,
  "dailyCarbTarget": 0,
  "dailyFatTarget": 0,
  "skippedFields": []
}`;

const INTAKE_SYSTEM_PROMPT = `You are an intake agent for a meal planning app. Extract EVERY possible preference from the user's natural language. Output maps directly to Spoonacular API filters. Do not skip or omit anything the user mentions.

CRITICAL: Extract every single detail. If the user says "no mushrooms", include mushrooms in excludeIngredients. If they say "under 600 cal", set calorieRange.max to 600. If they say "Mediterranean 2x a week", add mediterranean to preferredCuisines. If they say "DoorDash on Fridays", add friday to takeoutDays. If they say "30 min or less", set maxReadyTime to 30. If they say "no Italian", add italian to excludeCuisine. If they say "low carb", set carbRange max to 50. If they say "high protein", set proteinTarget to 40. Capture EVERYTHING.

Output a JSON object with these fields (use empty arrays/strings/0 when not specified):

INGREDIENTS:
- excludeIngredients: string[] - ingredients to avoid (e.g. mushrooms, dairy)

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

DAILY TARGETS (day-level, not per-meal):
- dailyCalorieTarget: number - total calories/day. "2000 calories a day" -> 2000. 0 = not set.
- dailyProteinTarget: number - total protein grams/day. "150g protein daily" -> 150. "high protein" -> 150. 0 = not set.
- dailyCarbTarget: number - total carb grams/day. "low carb daily" -> 100. 0 = not set.
- dailyFatTarget: number - total fat grams/day. 0 = not set.
Note: these are DAILY totals, not per-meal. "2000 calories a day" means dailyCalorieTarget=2000, not calorieRange.

SKIPPED FIELDS (critical for not re-asking):
- skippedFields: string[] - when user explicitly says "no", "none", "skip", "nope", "no allergies", "no dietary restrictions", "no takeout", "no limit", etc. for a category, add that field name. Use: "intolerances", "takeoutDays", "calorieRange", "proteinTarget", "carbRange", "preferredCuisines", "excludeCuisine", "maxReadyTime", "excludeIngredients", "includeIngredients", "mealTypes". Example: "no allergies" -> skippedFields: ["intolerances"]. "no takeout" -> skippedFields: ["takeoutDays"]. "no calorie limit" -> skippedFields: ["calorieRange"].

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
    takeoutDays: [],
    dailyCalorieTarget: 0,
    dailyProteinTarget: 0,
    dailyCarbTarget: 0,
    dailyFatTarget: 0,
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

/** Merge extracted into existing. Arrays append+dedupe; scalars/ranges replace when extracted has meaningful value. */
function mergeConstraints(
  existing: ExtractedConstraints,
  extracted: ExtractedConstraints
): ExtractedConstraints {
  const mergeArr = (a: string[], b: string[]) =>
    [...a, ...b].filter((v, i, arr) => arr.indexOf(v) === i);
  const hasRange = (r: { min: number; max: number }, defaultMax: number) =>
    r && (r.min > 0 || (r.max > 0 && r.max < defaultMax));
  const hasScalar = (v: number) => typeof v === "number" && v > 0;

  return {
    excludeIngredients: mergeArr(existing.excludeIngredients ?? [], extracted.excludeIngredients ?? []),
    includeIngredients: mergeArr(existing.includeIngredients ?? [], extracted.includeIngredients ?? []),
    preferredCuisines: mergeArr(existing.preferredCuisines ?? [], extracted.preferredCuisines ?? []),
    excludeCuisine: mergeArr(existing.excludeCuisine ?? [], extracted.excludeCuisine ?? []),
    intolerances: mergeArr(existing.intolerances ?? [], extracted.intolerances ?? []),
    mealTypes: mergeArr(existing.mealTypes ?? [], extracted.mealTypes ?? []),
    equipment: mergeArr(existing.equipment ?? [], extracted.equipment ?? []),
    takeoutDays: mergeArr(existing.takeoutDays ?? [], extracted.takeoutDays ?? []),
    diet: extracted.diet?.trim() ? extracted.diet.trim() : (existing.diet ?? ""),
    query: extracted.query?.trim() ? extracted.query.trim() : (existing.query ?? ""),
    sortPreference: extracted.sortPreference?.trim() ? extracted.sortPreference.trim() : (existing.sortPreference ?? ""),
    sortDirection: extracted.sortDirection === "desc" ? "desc" : (existing.sortDirection ?? "asc"),
    calorieRange: hasRange(extracted.calorieRange, 800) ? extracted.calorieRange : (existing.calorieRange ?? { min: 0, max: 800 }),
    carbRange: hasRange(extracted.carbRange, 999) ? extracted.carbRange : (existing.carbRange ?? { min: 0, max: 999 }),
    fatRange: hasRange(extracted.fatRange, 999) ? extracted.fatRange : (existing.fatRange ?? { min: 0, max: 999 }),
    sodiumRange: hasRange(extracted.sodiumRange, 9999) ? extracted.sodiumRange : (existing.sodiumRange ?? { min: 0, max: 9999 }),
    sugarRange: hasRange(extracted.sugarRange, 999) ? extracted.sugarRange : (existing.sugarRange ?? { min: 0, max: 999 }),
    servingRange: (extracted.servingRange && (extracted.servingRange.min > 0 || extracted.servingRange.max > 0))
      ? extracted.servingRange
      : (existing.servingRange ?? { min: 0, max: 0 }),
    proteinTarget: hasScalar(extracted.proteinTarget) ? extracted.proteinTarget : (existing.proteinTarget ?? 0),
    maxReadyTime: hasScalar(extracted.maxReadyTime) ? extracted.maxReadyTime : (existing.maxReadyTime ?? 0),
    dailyCalorieTarget: hasScalar(extracted.dailyCalorieTarget) ? extracted.dailyCalorieTarget : (existing.dailyCalorieTarget ?? 0),
    dailyProteinTarget: hasScalar(extracted.dailyProteinTarget) ? extracted.dailyProteinTarget : (existing.dailyProteinTarget ?? 0),
    dailyCarbTarget: hasScalar(extracted.dailyCarbTarget) ? extracted.dailyCarbTarget : (existing.dailyCarbTarget ?? 0),
    dailyFatTarget: hasScalar(extracted.dailyFatTarget) ? extracted.dailyFatTarget : (existing.dailyFatTarget ?? 0),
    skippedFields: mergeArr(existing.skippedFields ?? [], extracted.skippedFields ?? []),
  };
}

const SKIP = (merged: ExtractedConstraints, field: string) =>
  (merged.skippedFields ?? []).includes(field);

/** Human-readable summary of what we know and what's still missing. */
function getFilledAndMissing(merged: ExtractedConstraints): { filled: string[]; missing: string[] } {
  const filled: string[] = [];
  const missing: string[] = [];

  if (merged.diet?.trim()) filled.push("diet");
  else if (!SKIP(merged, "diet")) missing.push("diet");
  if ((merged.intolerances?.length ?? 0) > 0) filled.push("intolerances");
  else if (!SKIP(merged, "intolerances")) missing.push("intolerances");
  if ((merged.takeoutDays?.length ?? 0) > 0) filled.push("takeoutDays");
  else if (!SKIP(merged, "takeoutDays")) missing.push("takeoutDays");
  const calMax = merged.calorieRange?.max ?? 0;
  if (calMax > 0 && calMax < 800) filled.push("calorieRange");
  else if (!SKIP(merged, "calorieRange")) missing.push("calorieRange");
  if ((merged.proteinTarget ?? 0) > 25) filled.push("proteinTarget");
  else if (!SKIP(merged, "proteinTarget")) missing.push("proteinTarget");
  const carbMax = merged.carbRange?.max ?? 999;
  if (carbMax > 0 && carbMax < 999) filled.push("carbRange");
  else if (!SKIP(merged, "carbRange")) missing.push("carbRange");
  if ((merged.preferredCuisines?.length ?? 0) > 0) filled.push("preferredCuisines");
  else if (!SKIP(merged, "preferredCuisines")) missing.push("preferredCuisines");
  if ((merged.excludeCuisine?.length ?? 0) > 0) filled.push("excludeCuisine");
  else if (!SKIP(merged, "excludeCuisine")) missing.push("excludeCuisine");
  if ((merged.maxReadyTime ?? 0) > 0) filled.push("maxReadyTime");
  else if (!SKIP(merged, "maxReadyTime")) missing.push("maxReadyTime");
  if ((merged.excludeIngredients?.length ?? 0) > 0) filled.push("excludeIngredients");
  else if (!SKIP(merged, "excludeIngredients")) missing.push("excludeIngredients");
  if ((merged.mealTypes?.length ?? 0) > 0) filled.push("mealTypes");
  else if (!SKIP(merged, "mealTypes")) missing.push("mealTypes");

  return { filled, missing };
}

const CONVERSATION_PROMPT = `You are a warm, thoughtful meal-planning assistant. Have a natural conversation—not a checklist.

CRITICAL RULES:
1. NEVER repeat a question the user already didn't answer. If we asked about allergies and they said something else or moved on, skip it. Add that topic to skippedFields in your extraction.
2. Ask 2–3 related things at once when it flows naturally. "Any diet preferences, cuisines you love, or things to avoid?" beats asking one at a time.
3. Do NOT restate what they already have. They see it in the sidebar. Just ask what's still missing.
4. Be conversational. "What about cook time—quick weeknight meals or okay to spend an hour?" not "How long do you want to spend cooking?"
5. If the user's reply doesn't address what we asked (they changed topic, gave a vague answer, or said "skip"), move on. Do NOT ask the same thing again.
6. If nothing missing, warmly offer to generate their plan in one sentence.
7. Plain text only. No JSON.`;

/** Deterministic next question based on merged state. Never asks same thing twice. */
function getNextQuestion(merged: ExtractedConstraints): string | null {
  if (!SKIP(merged, "diet") && !merged.diet?.trim()) {
    return "Any diet? Vegetarian, vegan, gluten-free?";
  }
  if (!SKIP(merged, "intolerances") && (merged.intolerances?.length ?? 0) === 0) {
    return "Allergies or foods to avoid?";
  }
  if (!SKIP(merged, "takeoutDays") && (merged.takeoutDays?.length ?? 0) === 0) {
    return "Which days do you want takeout or delivery?";
  }
  const calMax = merged.calorieRange?.max ?? 0;
  if (!SKIP(merged, "calorieRange") && !(calMax > 0 && calMax < 800)) {
    return "Any calorie limit per meal? e.g. under 600?";
  }
  const protein = merged.proteinTarget ?? 0;
  if (!SKIP(merged, "proteinTarget") && protein <= 25) {
    return "Protein goals? e.g. high protein or a specific gram target?";
  }
  const carbMax = merged.carbRange?.max ?? 999;
  if (!SKIP(merged, "carbRange") && !(carbMax > 0 && carbMax < 999)) {
    return "Any carb limits? e.g. low carb or keto?";
  }
  if (!SKIP(merged, "preferredCuisines") && (merged.preferredCuisines?.length ?? 0) === 0) {
    return "Favorite cuisines? Mediterranean, Asian, Mexican?";
  }
  if (!SKIP(merged, "excludeCuisine") && (merged.excludeCuisine?.length ?? 0) === 0) {
    return "Any cuisines to avoid?";
  }
  const maxTime = merged.maxReadyTime ?? 0;
  if (!SKIP(merged, "maxReadyTime") && maxTime <= 0) {
    return "How long do you want to spend cooking? e.g. 30 minutes or less?";
  }
  if (!SKIP(merged, "excludeIngredients") && (merged.excludeIngredients?.length ?? 0) === 0) {
    return "Ingredients to avoid? e.g. mushrooms, onions?";
  }
  if (!SKIP(merged, "mealTypes") && (merged.mealTypes?.length ?? 0) === 0) {
    return "Focus on specific meals? Breakfast, lunch, dinner, or all?";
  }
  return null;
}

function prefsToConstraints(doc: UserPreferences | null): ExtractedConstraints {
  const def = getDefaultConstraints();
  if (!doc) return def;
  return {
    ...def,
    excludeIngredients: doc.excludeIngredients ?? [],
    includeIngredients: doc.includeIngredients ?? [],
    preferredCuisines: doc.preferredCuisines ?? [],
    excludeCuisine: doc.excludeCuisine ?? [],
    diet: doc.diet ?? "",
    intolerances: doc.intolerances ?? [],
    calorieRange: doc.calorieRange ?? { min: 0, max: 800 },
    proteinTarget: doc.proteinTarget ?? 0,
    carbRange: doc.carbRange ?? { min: 0, max: 999 },
    fatRange: doc.fatRange ?? { min: 0, max: 999 },
    sodiumRange: doc.sodiumRange ?? { min: 0, max: 9999 },
    sugarRange: doc.sugarRange ?? { min: 0, max: 999 },
    maxReadyTime: doc.maxReadyTime ?? 0,
    mealTypes: doc.mealTypes ?? [],
    equipment: doc.equipment ?? [],
    servingRange: doc.servingRange ?? { min: 0, max: 0 },
    query: doc.query ?? "",
    sortPreference: doc.sortPreference ?? "",
    sortDirection: doc.sortDirection ?? "asc",
    takeoutDays: doc.takeoutDays ?? [],
    dailyCalorieTarget: doc.dailyCalorieTarget ?? 0,
    dailyProteinTarget: doc.dailyProteinTarget ?? 0,
    dailyCarbTarget: doc.dailyCarbTarget ?? 0,
    dailyFatTarget: doc.dailyFatTarget ?? 0,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { text, userId = "demo", existingPreferences, lastQuestion } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'text' field" },
        { status: 400 }
      );
    }

    const userSaidDone = /^(done|that'?s it|i'?m good|i'?m ready|ready|let'?s go|sounds good|good to go|that works|let'?s do it|all set|all good|none|skip|that'?s all|no more|nothing else|looks good|perfect|great)$/i.test(text.trim());

    const { client, model } = getLLMClient();

    const userMsg = lastQuestion
      ? `[We just asked: "${lastQuestion}"]\n\nUser replied: "${text}"\n\nIf the user's reply does NOT address what we asked (they changed topic, gave unrelated info, said skip/none, or deflected), add the relevant field to skippedFields so we never ask again.`
      : text;
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: INTAKE_SYSTEM_PROMPT },
        { role: "user", content: userMsg },
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
    extracted.preferredCuisines = arr(extracted.preferredCuisines);
    extracted.excludeCuisine = arr(extracted.excludeCuisine);
    extracted.intolerances = arr(extracted.intolerances);
    extracted.mealTypes = arr(extracted.mealTypes);
    extracted.equipment = arr(extracted.equipment);
    extracted.takeoutDays = arr(extracted.takeoutDays);
    const skipArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    extracted.skippedFields = skipArr(extracted.skippedFields);

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
      typeof parsed.proteinTarget === "number" ? parsed.proteinTarget : 0;
    extracted.query =
      typeof parsed.query === "string" ? parsed.query.trim() : "";
    extracted.sortPreference =
      typeof parsed.sortPreference === "string" ? parsed.sortPreference : "";
    extracted.sortDirection =
      parsed.sortDirection === "desc" ? "desc" : "asc";
    extracted.diet = typeof parsed.diet === "string" ? parsed.diet : "";

    extracted.dailyCalorieTarget =
      typeof parsed.dailyCalorieTarget === "number" && parsed.dailyCalorieTarget >= 0
        ? parsed.dailyCalorieTarget
        : 0;
    extracted.dailyProteinTarget =
      typeof parsed.dailyProteinTarget === "number" && parsed.dailyProteinTarget >= 0
        ? parsed.dailyProteinTarget
        : 0;
    extracted.dailyCarbTarget =
      typeof parsed.dailyCarbTarget === "number" && parsed.dailyCarbTarget >= 0
        ? parsed.dailyCarbTarget
        : 0;
    extracted.dailyFatTarget =
      typeof parsed.dailyFatTarget === "number" && parsed.dailyFatTarget >= 0
        ? parsed.dailyFatTarget
        : 0;

    // Fallback: when user says skip/none/deflect and we have lastQuestion, map to skippedFields
    const skipPhrase = /^(no|none|nope|skip|no thanks|nah|not really|that'?s all|no more|nothing else|idk|dunno|next|pass|move on|no preference)$/i.test(text.trim());
    if (skipPhrase && lastQuestion && typeof lastQuestion === "string") {
      const q = lastQuestion.toLowerCase();
      const fieldMap: [RegExp, string][] = [
        [/allerg|intoler|foods to avoid/, "intolerances"],
        [/order in|delivery|takeout/, "takeoutDays"],
        [/calorie limit|calories/, "calorieRange"],
        [/protein/, "proteinTarget"],
        [/carb limit|low carb|keto/, "carbRange"],
        [/cuisines you love|cuisines you like/, "preferredCuisines"],
        [/cuisines to avoid|no italian/, "excludeCuisine"],
        [/cook time|ready time|minutes/, "maxReadyTime"],
        [/ingredients to avoid/, "excludeIngredients"],
        [/ingredients to use|leftover/, "includeIngredients"],
        [/specific meals|breakfast.*lunch.*dinner/, "mealTypes"],
        [/vegetarian|vegan|diet|gluten-free/, "diet"],
      ];
      for (const [re, field] of fieldMap) {
        if (re.test(q) && !(extracted.skippedFields ?? []).includes(field)) {
          extracted.skippedFields = [...(extracted.skippedFields ?? []), field];
          break;
        }
      }
    }

    let existing: ExtractedConstraints;
    if (existingPreferences && typeof existingPreferences === "object") {
      existing = { ...getDefaultConstraints(), ...existingPreferences };
    } else if (process.env.MONGODB_URI) {
      const db = await connectDB();
      const doc = await db.collection<UserPreferences>("user_preferences").findOne({ userId });
      existing = prefsToConstraints(doc);
    } else {
      existing = getDefaultConstraints();
    }

    const merged = mergeConstraints(existing, extracted);

    let saved = false;
    if (process.env.MONGODB_URI) {
      const db = await connectDB();
      const collection = db.collection<UserPreferences>("user_preferences");
      const now = new Date();
      const setFields = {
        excludeIngredients: merged.excludeIngredients,
        includeIngredients: merged.includeIngredients,
        preferredCuisines: merged.preferredCuisines,
        excludeCuisine: merged.excludeCuisine,
        diet: merged.diet,
        intolerances: merged.intolerances,
        calorieRange: merged.calorieRange,
        proteinTarget: merged.proteinTarget,
        carbRange: merged.carbRange,
        fatRange: merged.fatRange,
        sodiumRange: merged.sodiumRange,
        sugarRange: merged.sugarRange,
        maxReadyTime: merged.maxReadyTime,
        mealTypes: merged.mealTypes,
        equipment: merged.equipment,
        servingRange: merged.servingRange,
        query: merged.query,
        sortPreference: merged.sortPreference,
        sortDirection: merged.sortDirection,
        takeoutDays: merged.takeoutDays,
        dailyCalorieTarget: merged.dailyCalorieTarget,
        dailyProteinTarget: merged.dailyProteinTarget,
        dailyCarbTarget: merged.dailyCarbTarget,
        dailyFatTarget: merged.dailyFatTarget,
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
      saved = true;
    }

    let nextQuestion: string | null = null;
    if (!userSaidDone) {
      const { filled, missing } = getFilledAndMissing(merged);
      const summary = [
        "Already set:",
        ...filled.map((f) => `- ${f}`),
        "",
        "Still missing (only ask about these):",
        ...missing.map((m) => `- ${m}`),
      ].join("\n");
      const humanPrefs = [
        merged.diet && `Diet: ${merged.diet}`,
        merged.intolerances?.length && `Avoid: ${merged.intolerances.join(", ")}`,
        merged.calorieRange?.max && merged.calorieRange.max < 800 && `Calories: up to ${merged.calorieRange.max}/meal`,
        (merged.proteinTarget ?? 0) > 25 && `Protein: ${merged.proteinTarget}g+`,
        merged.carbRange?.max && merged.carbRange.max < 999 && `Carbs: max ${merged.carbRange.max}g`,
        merged.preferredCuisines?.length && `Cuisines: ${merged.preferredCuisines.join(", ")}`,
        merged.excludeCuisine?.length && `No: ${merged.excludeCuisine.join(", ")}`,
        (merged.maxReadyTime ?? 0) > 0 && `Cook time: ${merged.maxReadyTime} min max`,
        merged.takeoutDays?.length && `Takeout: ${merged.takeoutDays.join(", ")}`,
        merged.excludeIngredients?.length && `Exclude: ${merged.excludeIngredients.join(", ")}`,
        merged.includeIngredients?.length && `Include: ${merged.includeIngredients.join(", ")}`,
      ]
        .filter(Boolean)
        .join("\n");
      try {
        const convRes = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: CONVERSATION_PROMPT },
            {
              role: "user",
              content: [
                `Current preferences we have:\n${humanPrefs || "(none yet)"}`,
                "",
                summary,
                "",
                `User just said: "${text}"`,
                "",
                "Generate your next message. Do NOT restate what they have. Ask 2-3 missing items together when natural. NEVER repeat a question we already asked. If nothing missing, warmly wrap up.",
              ].join("\n"),
            },
          ],
          temperature: 0.5,
          max_tokens: 200,
        });
        const reply = convRes.choices[0]?.message?.content?.trim();
        if (reply && reply.length > 10) {
          nextQuestion = reply;
        }
      } catch (e) {
        console.warn("Conversation LLM failed, using fallback:", e);
      }
      if (!nextQuestion) {
        nextQuestion = getNextQuestion(merged);
      }
    }

    return NextResponse.json({
      extracted,
      merged,
      saved,
      nextQuestion,
    });
  } catch (err) {
    console.error("Intake error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Intake failed" },
      { status: 500 }
    );
  }
}
