"use client";

import Chat from "@/app/components/Chat";
import SignOutButton from "@/app/components/SignOutButton";
import TakeoutOrderButton from "@/app/components/TakeoutOrderButton";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

type ExpandedRecipe = { day: string; mealType: string } | null;
type FridgeItem = { id: string; label: string };

export default function MealPlanPage() {
  const { isLoading } = useConvexAuth();
  const activePlan = useQuery(api.mealPlans.getActivePlan);
  const currentUser = useQuery(api.preferences.currentUser);
  const groceryList = useQuery(
    api.groceryList.get,
    activePlan?._id ? { mealPlanId: activePlan._id } : "skip"
  );
  const generateGroceryList = useMutation(api.groceryList.generate);
  const [chatOpen, setChatOpen] = useState(false);
  const [fridgeOpen, setFridgeOpen] = useState(true);
  const [expandedRecipe, setExpandedRecipe] = useState<ExpandedRecipe>(null);
  const [fridgeItems, setFridgeItems] = useState<FridgeItem[]>([]);
  const [fridgeInput, setFridgeInput] = useState("");
  const [groceryGenerating, setGroceryGenerating] = useState(false);
  const [instacartOrdering, setInstacartOrdering] = useState(false);
  const [instacartResult, setInstacartResult] = useState<string | null>(null);
  const [instacartError, setInstacartError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#fdfbf8] via-[#f9f5f0] to-[#f5efe8]">
        <div className="flex gap-2">
          <span className="w-2 h-2 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const mealTypes = ["breakfast", "lunch", "dinner"] as const;

  const getMeal = (day: string, mealType: string) => {
    if (!activePlan?.meals) return null;
    return activePlan.meals.find(
      (m: any) => m.day === day && m.mealType === mealType && !m.isSkipped
    );
  };

  const getDayCalories = (day: string) => {
    if (!activePlan?.meals) return 0;
    return activePlan.meals
      .filter((m: any) => m.day === day && !m.isSkipped)
      .reduce((sum: number, m: any) => sum + (m.calories || 0), 0);
  };

  const addFridgeItems = () => {
    const labels = fridgeInput
      .split(/[,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (labels.length === 0) return;
    const existing = new Set(fridgeItems.map((i) => i.label.toLowerCase()));
    const newItems: FridgeItem[] = labels
      .filter((l) => !existing.has(l))
      .map((label) => ({ id: `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, label }));
    setFridgeItems((prev) => [...prev, ...newItems]);
    setFridgeInput("");
  };

  const removeFridgeItem = (id: string) => {
    setFridgeItems((prev) => prev.filter((i) => i.id !== id));
  };

  const INGREDIENT_IMAGE_MAP: Record<string, string> = {
    potatoes: "potato",
    tomatoes: "tomato",
    tomato: "tomato",
    peppers: "bell-pepper",
    pepper: "black-pepper",
    "bell pepper": "bell-pepper",
    "bell peppers": "bell-pepper",
    "green pepper": "bell-pepper",
    "red pepper": "bell-pepper",
    "yellow pepper": "bell-pepper",
    broccoli: "broccoli",
    pepperoni: "pepperoni",
    salt: "salt",
    "flat leaf parsley": "parsley",
    "flat-leaf parsley": "parsley",
    "italian parsley": "parsley",
    "curly parsley": "parsley",
    "kosher salt": "salt",
    "sea salt": "salt",
    "table salt": "salt",
    "coarse salt": "salt",
    parsley: "parsley",
    basil: "basil",
    cilantro: "cilantro",
    garlic: "garlic",
    ginger: "ginger",
    onion: "onion",
    "green onions": "scallions",
    scallions: "scallions",
    lemon: "lemon",
    lime: "lime",
    "olive oil": "olive-oil",
    "soy sauce": "soy-sauce",
    "sesame oil": "sesame-oil",
    "rice vinegar": "rice-vinegar",
    chicken: "chicken",
    beef: "beef",
    "chicken broth": "chicken-broth",
    "vegetable broth": "vegetable-broth",
    "beef broth": "beef-broth",
    carrot: "carrot",
    carrots: "carrot",
    celery: "celery",
    onions: "onion",
    eggs: "egg",
    egg: "egg",
    flour: "flour",
    butter: "butter",
    milk: "milk",
    cheese: "cheddar-cheese",
    "cream cheese": "cream-cheese",
    honey: "honey",
    sugar: "sugar",
    vinegar: "vinegar",
    "apple cider vinegar": "apple-cider-vinegar",
    "balsamic vinegar": "balsamic-vinegar",
    coconut: "coconut",
    "coconut milk": "coconut-milk",
    "fish sauce": "fish-sauce",
    "oyster sauce": "oyster-sauce",
  };

  const getIngredientImageUrl = (label: string) => {
    const key = label.toLowerCase().trim().replace(/\s+/g, " ");
    const words = key.split(/\s+/);
    const rawSlug =
      INGREDIENT_IMAGE_MAP[key] ??
      (words.length > 1 ? INGREDIENT_IMAGE_MAP[words[words.length - 1]!] : undefined) ??
      key;
    const slug = rawSlug
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    return `https://img.spoonacular.com/ingredients_100x100/${slug}.jpg`;
  };

  // Client-side synonym map for grocery list deduplication
  const GROCERY_SYNONYMS: Record<string, string> = {
    "pepper flakes": "pepper",
    "red pepper flakes": "pepper",
    "crushed red pepper": "pepper",
    "ground pepper": "pepper",
    "black pepper": "pepper",
    "white pepper": "pepper",
    "kosher salt": "salt",
    "sea salt": "salt",
    "table salt": "salt",
    "coarse salt": "salt",
    "flat leaf parsley": "parsley",
    "flat-leaf parsley": "parsley",
    "italian parsley": "parsley",
    "curly parsley": "parsley",
    "light soy sauce": "soy sauce",
    "dark soy sauce": "soy sauce",
    "toasted sesame oil": "sesame oil",
    "extra virgin olive oil": "olive oil",
    "extra-virgin olive oil": "olive oil",
    "rice wine vinegar": "rice vinegar",
    "scallions": "green onions",
    "spring onions": "green onions",
    "fresh garlic": "garlic",
    "fresh ginger": "ginger",
    "ginger root": "ginger",
    "chicken stock": "chicken broth",
    "vegetable stock": "vegetable broth",
    "beef stock": "beef broth",
    "cherry tomato": "tomato",
    "cherry tomatoes": "tomato",
    tomatoes: "tomato",
  };

  const toSingular = (word: string): string => {
    const w = word.toLowerCase();
    if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
    if (w.endsWith("es") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -2);
    if (w.endsWith("s") && !w.endsWith("ss") && w.length > 2) return w.slice(0, -1);
    return w;
  };

  const getGroceryCanonicalKey = (name: string) => {
    const normalized = name.toLowerCase().trim().replace(/\s+/g, " ");
    const withSynonym = GROCERY_SYNONYMS[normalized] ?? normalized;
    const words = withSynonym.split(/\s+/);
    const lastWord = words[words.length - 1];
    if (lastWord) {
      words[words.length - 1] = toSingular(lastWord);
    }
    return words.join(" ");
  };

  const isInFridge = (groceryName: string) => {
    const groceryKey = getGroceryCanonicalKey(groceryName);
    return fridgeItems.some(
      (f) => getGroceryCanonicalKey(f.label) === groceryKey
    );
  };

  const getDedupedGroceryItems = () => {
    if (!groceryList?.items?.length) return [];
    const seen = new Set<string>();
    const filtered = groceryList.items.filter((item: { name: string }) => {
      const key = getGroceryCanonicalKey(item.name);
      if (seen.has(key)) return false;
      if (isInFridge(item.name)) return false;
      seen.add(key);
      return true;
    });
    const hasSalt = seen.has("salt");
    const hasPepper = seen.has("pepper");
    return filtered.filter((item: { name: string }) => {
      const norm = item.name.toLowerCase().trim().replace(/\s+/g, " ");
      if (norm === "salt and pepper" && hasSalt && hasPepper) return false;
      return true;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-[#fdfbf8] via-[#f9f5f0] to-[#f5efe8] dark:from-stone-950 dark:via-stone-900 dark:to-stone-950">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-white/80 dark:bg-stone-900/80 backdrop-blur-md border-b border-stone-200/60 dark:border-stone-800 shrink-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2">
                <img src="/icon.svg" alt="Aurelia" className="w-8 h-8" />
                <span className="font-display text-xl font-semibold text-stone-800 dark:text-stone-100">Aurelia</span>
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 hover:text-stone-800 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-800 transition-colors"
              >
                Home
              </Link>
              <SignOutButton className="px-4 py-2 rounded-xl text-sm font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800 transition-colors">
                Sign out
              </SignOutButton>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            {!activePlan ? (
              <div className="text-center py-20">
                <h2 className="font-display text-2xl font-semibold text-stone-800 dark:text-stone-100 mb-4">
                  No meal plan yet
                </h2>
                <p className="text-stone-500 dark:text-stone-400 mb-8 max-w-md mx-auto">
                  Head back to the chat and tell Aurelia about your dietary preferences. She&apos;ll generate a personalized meal plan for you.
                </p>
                <Link
                  href="/"
                  className="inline-flex px-6 py-3 rounded-xl bg-rust-500/90 hover:bg-rust-600 text-white font-medium transition-colors shadow-sm"
                >
                  Start planning
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <h1 className="font-display text-3xl font-semibold text-stone-800 dark:text-stone-100">
                    {(() => {
                      const hour = new Date().getHours();
                      const greeting =
                        hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
                      const name = currentUser?.name ?? currentUser?.email?.split("@")[0] ?? "there";
                      return `${greeting}, ${name}`;
                    })()}
                  </h1>
                </div>

                {/* Day cards + nutrition widget */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
                  {days.map((day) => {
                    const dayCalories = getDayCalories(day);
                    return (
                      <div
                        key={day}
                        className="rounded-xl border border-stone-200/60 dark:border-stone-700/50 bg-white/80 dark:bg-stone-800/60 p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-semibold text-stone-800 dark:text-stone-200 capitalize">
                            {day}
                          </h3>
                          {dayCalories > 0 && (
                            <span className="text-sm font-medium text-rust-600 dark:text-rust-400">
                              {Math.round(dayCalories)} cal
                            </span>
                          )}
                        </div>
                        <div className="space-y-0">
                          {mealTypes.map((mealType) => {
                            const meal = getMeal(day, mealType);
                            const isExpanded = expandedRecipe?.day === day && expandedRecipe?.mealType === mealType;
                            return (
                              <div key={`${day}-${mealType}`} className="border-b border-stone-100 dark:border-stone-700/40 last:border-0 pt-3 pb-3 last:pb-0 min-h-[72px] flex flex-col">
                                <p className="text-xs font-medium text-stone-500 dark:text-stone-400 capitalize mb-1 shrink-0">
                                  {mealType}
                                </p>
                                {meal ? (
                                  meal.isTakeout ? (
                                    <TakeoutOrderButton variant="card" searchIntent={meal.recipeName} />
                                  ) : (
                                  <div>
                                    {(meal.recipeImageUrl || meal.sourceUrl || meal.recipeId) ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const nextExpanded = isExpanded ? null : { day, mealType };
                                            setExpandedRecipe(nextExpanded);
                                          }}
                                          className="text-left w-full text-sm font-medium text-stone-800 dark:text-stone-200 hover:text-rust-600 dark:hover:text-rust-400 transition-colors"
                                        >
                                          {meal.recipeName}
                                        </button>
                                        {isExpanded && (
                                          <div className="mt-2 space-y-3">
                                            {/* Recipe image + link */}
                                            {(meal.recipeImageUrl || meal.sourceUrl || meal.recipeId) && (
                                              <div className="space-y-1">
                                                {meal.recipeImageUrl && (
                                                  <img
                                                    src={meal.recipeImageUrl}
                                                    alt={meal.recipeName}
                                                    className="w-full h-32 object-cover rounded-lg"
                                                  />
                                                )}
                                                {(meal.sourceUrl || meal.recipeId) && (
                                                  <a
                                                    href={
                                                      meal.sourceUrl ||
                                                      `https://spoonacular.com/recipes/${(meal.recipeName || "recipe").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}-${meal.recipeId}`
                                                    }
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="block text-xs font-medium text-rust-600 dark:text-rust-400 hover:underline truncate"
                                                  >
                                                    View recipe →
                                                  </a>
                                                )}
                                              </div>
                                            )}
                                            {/* Ingredients */}
                                            <div>
                                              <p className="text-[10px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-1">Ingredients</p>
                                              {meal.ingredients && meal.ingredients.length > 0 ? (
                                                <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
                                                  {meal.ingredients.map((ing: { name: string }, i: number) => ing.name).join(", ")}
                                                </p>
                                              ) : (
                                                <p className="text-xs text-stone-500 dark:text-stone-400 italic">
                                                  Ingredients not available.
                                                </p>
                                              )}
                                            </div>
                                            {/* Nutrition summary */}
                                            {(meal.calories != null || meal.protein != null || meal.carbs != null || meal.fat != null) && (
                                              <div className="pt-2 border-t border-stone-100 dark:border-stone-700/40">
                                                <p className="text-[10px] font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-1">Nutrition</p>
                                                <p className="text-xs text-stone-600 dark:text-stone-300">
                                                  {Math.round(meal.calories || 0)} cal
                                                  {(meal.protein != null || meal.carbs != null || meal.fat != null) && (
                                                    <span className="text-stone-400 dark:text-stone-500 mx-1.5">·</span>
                                                  )}
                                                  {meal.protein != null && <span className="text-blue-600 dark:text-blue-400">P {Math.round(meal.protein)}g</span>}
                                                  {meal.protein != null && (meal.carbs != null || meal.fat != null) && <span className="text-stone-400 dark:text-stone-500 mx-1">·</span>}
                                                  {meal.carbs != null && <span className="text-rust-600 dark:text-rust-400">C {Math.round(meal.carbs)}g</span>}
                                                  {meal.carbs != null && meal.fat != null && <span className="text-stone-400 dark:text-stone-500 mx-1">·</span>}
                                                  {meal.fat != null && <span className="text-stone-600 dark:text-stone-400">F {Math.round(meal.fat)}g</span>}
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <p className="text-sm font-medium text-stone-800 dark:text-stone-200">
                                        {meal.recipeName}
                                      </p>
                                    )}
                                  </div>
                                  )
                                ) : (
                                  <div className="flex-1 flex items-start">
                                    <TakeoutOrderButton variant="card" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {/* Nutrition widget - macro ring, next to Sunday */}
                  {activePlan.meals && activePlan.meals.length > 0 && (() => {
                    const nonSkipped = activePlan.meals.filter((m: any) => !m.isSkipped);
                    const totalCal = nonSkipped.reduce((s: number, m: any) => s + (m.calories || 0), 0);
                    const totalProtein = nonSkipped.reduce((s: number, m: any) => s + (m.protein || 0), 0);
                    const totalCarbs = nonSkipped.reduce((s: number, m: any) => s + (m.carbs || 0), 0);
                    const totalFat = nonSkipped.reduce((s: number, m: any) => s + (m.fat || 0), 0);
                    const numDays = new Set(nonSkipped.map((m: any) => m.day)).size || 1;
                    const numMeals = nonSkipped.length;
                    const calPerDay = Math.round(totalCal / numDays);
                    const proteinPerDay = Math.round(totalProtein / numDays);
                    const carbsPerDay = Math.round(totalCarbs / numDays);
                    const fatPerDay = Math.round(totalFat / numDays);
                    const macroCal = proteinPerDay * 4 + carbsPerDay * 4 + fatPerDay * 9;
                    const pctP = macroCal > 0 ? (proteinPerDay * 4) / macroCal : 0.33;
                    const pctC = macroCal > 0 ? (carbsPerDay * 4) / macroCal : 0.33;
                    const pctF = macroCal > 0 ? (fatPerDay * 9) / macroCal : 0.34;
                    const p1 = pctP * 100;
                    const p2 = (pctP + pctC) * 100;
                    return (
                      <div className="rounded-2xl border border-stone-200/60 dark:border-stone-700/50 bg-white/90 dark:bg-stone-800/60 p-4 flex flex-col items-center justify-center gap-3">
                        <div
                          className="relative w-32 h-32 rounded-full shrink-0"
                          style={{
                            background: `conic-gradient(from -90deg, #4a7a9a 0% ${p1}%, #c87050 ${p1}% ${p2}%, #a8a29e ${p2}% 100%)`,
                          }}
                        >
                          <div className="absolute inset-[24%] rounded-full bg-[#fdfbf8] dark:bg-stone-800/90" />
                          <div className="absolute inset-[24%] flex flex-col items-center justify-center rounded-full pointer-events-none">
                            <span className="text-lg font-bold text-stone-800 dark:text-stone-100 leading-none">{calPerDay}</span>
                            <span className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">cal/day</span>
                          </div>
                        </div>
                        <div className="text-sm text-stone-600 dark:text-stone-400 text-center leading-tight">
                          <span className="text-blue-600 dark:text-blue-400">P {proteinPerDay}g</span>
                          <span className="mx-1.5 text-stone-300 dark:text-stone-600">·</span>
                          <span className="text-rust-600 dark:text-rust-400">C {carbsPerDay}g</span>
                          <span className="mx-1.5 text-stone-300 dark:text-stone-600">·</span>
                          <span className="text-stone-600 dark:text-stone-400">F {fatPerDay}g</span>
                        </div>
                        <p className="text-xs text-stone-500 dark:text-stone-400 text-center">
                          {numMeals} meal{numMeals !== 1 ? "s" : ""} · {numDays} day{numDays !== 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-stone-500 dark:text-stone-400 text-center">
                          Total: {Math.round(totalCal)} cal
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {/* Fridge sidebar - collapsible */}
      <aside className={`hidden md:flex shrink-0 flex-col border-l border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 transition-[width] duration-200 ease-out ${fridgeOpen ? "w-64 lg:w-72" : "w-12"}`}>
        {fridgeOpen ? (
          <div className="flex flex-1 flex-col overflow-hidden min-w-0 min-h-0">
            <div className="shrink-0 px-4 py-2 flex items-center justify-between border-b border-stone-200 dark:border-stone-700">
              <h2 className="font-display text-base font-semibold text-stone-800 dark:text-stone-200">My Fridge</h2>
              <button
                type="button"
                onClick={() => setFridgeOpen(false)}
                className="w-8 h-8 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center transition-colors"
                aria-label="Collapse sidebar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
              {/* Fridge section */}
              <div className="shrink-0 px-4 py-3 border-b border-stone-200 dark:border-stone-700">
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={fridgeInput}
                    onChange={(e) => setFridgeInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addFridgeItems()}
                    placeholder="Add ingredients..."
                    className="flex-1 min-w-0 px-3 py-2 rounded-full text-sm bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-600 text-stone-800 dark:text-stone-200 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-rust-500/30"
                  />
                  <button
                    type="button"
                    onClick={addFridgeItems}
                    className="px-4 py-2 rounded-full bg-rust-500 hover:bg-rust-600 text-white text-sm font-semibold shrink-0 transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="relative rounded-xl border border-stone-200 dark:border-stone-600 bg-stone-50/50 dark:bg-stone-800/50 min-h-[140px] p-3">
                  <div className="flex flex-wrap gap-2 content-start">
                    {fridgeItems.map((item) => (
                      <div
                        key={item.id}
                        className="group relative flex flex-col items-center gap-1 px-2 py-2 rounded-xl bg-white dark:bg-stone-700/80 border border-stone-200 dark:border-stone-600 hover:border-rust-300 dark:hover:border-rust-700 transition-colors"
                      >
                        <div className="relative w-10 h-10 shrink-0">
                          <img
                            src={getIngredientImageUrl(item.label)}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                              const fb = e.currentTarget.nextElementSibling as HTMLElement;
                              if (fb) fb.classList.remove("hidden");
                            }}
                          />
                          <span
                            className="hidden absolute inset-0 w-10 h-10 rounded-lg bg-stone-200 dark:bg-stone-600 flex items-center justify-center text-sm font-semibold text-stone-600 dark:text-stone-400"
                            aria-hidden
                          >
                            {item.label.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-[10px] font-medium text-stone-600 dark:text-stone-400 max-w-[70px] truncate text-center">
                          {item.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFridgeItem(item.id)}
                          className="absolute -top-0.5 -right-0.5 opacity-0 group-hover:opacity-100 w-4 h-4 rounded-full bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold flex items-center justify-center transition-opacity"
                          aria-label={`Remove ${item.label}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {fridgeItems.length === 0 && (
                      <p className="absolute inset-0 flex items-center justify-center text-sm text-stone-400 dark:text-stone-500 text-center px-4">
                        Add ingredients above
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Grocery list section - same style as fridge */}
              <div className="flex-1 min-h-0 px-4 py-3 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display text-base font-semibold text-stone-800 dark:text-stone-200">Grocery list</h3>
                  {activePlan?._id && groceryList?.items && groceryList.items.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!activePlan?._id) return;
                        setGroceryGenerating(true);
                        try {
                          await generateGroceryList({ mealPlanId: activePlan._id });
                        } finally {
                          setGroceryGenerating(false);
                        }
                      }}
                      disabled={groceryGenerating}
                      className="text-[10px] font-semibold text-rust-600 dark:text-rust-400 hover:underline disabled:opacity-60"
                    >
                      {groceryGenerating ? "Updating…" : "Regenerate"}
                    </button>
                  )}
                </div>
                {activePlan?._id && (
                  (groceryList?.items && groceryList.items.length > 0) ? (
                    <div className="relative flex-1 min-h-[140px] rounded-xl border border-stone-200 dark:border-stone-600 bg-stone-50/50 dark:bg-stone-800/50 p-3 overflow-y-auto">
                      <div className="grid grid-cols-3 gap-2">
                        {getDedupedGroceryItems().map((item: { name: string }, i: number) => {
                              const canonicalKey = getGroceryCanonicalKey(item.name);
                              const displayName =
                                canonicalKey.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
                              return (
                          <div
                            key={`${item.name}-${i}`}
                            className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white dark:bg-stone-700/80 border border-stone-200 dark:border-stone-600 min-w-0"
                          >
                            <div className="relative w-full aspect-square max-w-12 shrink-0">
                              <img
                                src={getIngredientImageUrl(displayName)}
                                alt=""
                                className="w-full h-full rounded-lg object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  const fb = e.currentTarget.nextElementSibling as HTMLElement;
                                  if (fb) fb.classList.remove("hidden");
                                }}
                              />
                              <span
                                className="hidden absolute inset-0 w-full h-full rounded-lg bg-stone-200 dark:bg-stone-600 flex items-center justify-center text-sm font-semibold text-stone-600 dark:text-stone-400"
                                aria-hidden
                              >
                                {displayName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="text-[10px] font-medium text-stone-600 dark:text-stone-400 w-full truncate text-center">
                              {displayName}
                            </span>
                          </div>
                        );
                        })}
                      </div>
                      {getDedupedGroceryItems().length > 0 && (
                        <div className="mt-3 space-y-2">
                          <button
                            type="button"
                            onClick={async () => {
                              const items = getDedupedGroceryItems();
                              if (items.length === 0) return;
                              setInstacartOrdering(true);
                              setInstacartResult(null);
                              setInstacartError(null);
                              try {
                                const res = await fetch("/api/instacart", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    items: items.map((i: { name: string; amount?: number; unit?: string }) => ({
                                      name: i.name,
                                      amount: i.amount,
                                      unit: i.unit,
                                    })),
                                  }),
                                });
                                const data = await res.json();
                                if (!res.ok) {
                                  setInstacartError(data.error || "Order failed");
                                  return;
                                }
                                setInstacartResult(data.output || "Items added to cart.");
                                if (data.liveUrl) {
                                  window.open(data.liveUrl, "_blank");
                                }
                              } catch (err) {
                                setInstacartError(err instanceof Error ? err.message : "Something went wrong");
                              } finally {
                                setInstacartOrdering(false);
                              }
                            }}
                            disabled={instacartOrdering}
                            className="w-full py-2 rounded-xl bg-rust-500/90 hover:bg-rust-600 disabled:opacity-60 text-white text-sm font-medium transition-all active:scale-[0.97] shadow-sm"
                          >
                            {instacartOrdering ? "Adding to Instacart…" : "Order on Instacart"}
                          </button>
                          {instacartResult && (
                            <p className="text-xs text-rust-600 dark:text-rust-400">{instacartResult}</p>
                          )}
                          {instacartError && (
                            <p className="text-xs text-stone-600 dark:text-stone-400">{instacartError}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative flex-1 min-h-[140px] rounded-xl border border-stone-200 dark:border-stone-600 bg-stone-50/50 dark:bg-stone-800/50 p-3 flex flex-col items-center justify-center">
                      <p className="text-sm text-stone-500 dark:text-stone-400 text-center mb-3">
                        Add items from your recipes
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!activePlan?._id) return;
                          setGroceryGenerating(true);
                          try {
                            await generateGroceryList({ mealPlanId: activePlan._id });
                          } finally {
                            setGroceryGenerating(false);
                          }
                        }}
                        disabled={groceryGenerating}
                        className="px-4 py-2 rounded-full bg-rust-500 hover:bg-rust-600 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
                      >
                        {groceryGenerating ? "Generating…" : "Add items to grocery list"}
                      </button>
                    </div>
                  )
                )}
                {!activePlan?._id && (
                  <div className="relative flex-1 min-h-[140px] rounded-xl border border-stone-200 dark:border-stone-600 bg-stone-50/50 dark:bg-stone-800/50 p-3 flex items-center justify-center">
                    <p className="text-sm text-stone-500 dark:text-stone-400 text-center">
                      Create a meal plan first
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setFridgeOpen(true)}
            className="flex h-full w-full items-center justify-center bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
            aria-label="Expand fridge"
            title="Show fridge"
          >
            <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 [writing-mode:vertical-rl] rotate-180">
              Fridge
            </span>
          </button>
        )}
      </aside>

      {/* Chat panel — desktop sidebar */}
      {chatOpen && (
        <aside className="hidden md:flex w-96 shrink-0 flex-col border-l border-stone-200/60 dark:border-stone-800 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md">
          <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-stone-200/60 dark:border-stone-800">
            <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Chat with Aurelia</h2>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="w-8 h-8 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center transition-colors"
            >
              &times;
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Chat variant="panel" placeholder="Swap Thursday dinner to pasta..." />
          </div>
        </aside>
      )}

      {/* Chat panel — mobile full-width overlay */}
      {chatOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md flex flex-col">
          <div className="shrink-0 px-4 py-3 flex items-center justify-between border-b border-stone-200/60 dark:border-stone-800">
            <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Chat with Aurelia</h2>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="w-8 h-8 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center transition-colors"
            >
              &times;
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Chat variant="panel" placeholder="Swap Thursday dinner to pasta..." />
          </div>
        </div>
      )}

      {/* Floating toggle button */}
      {!chatOpen && (
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 px-5 py-3 rounded-full bg-rust-500 hover:bg-rust-600 text-white font-semibold text-sm transition-all active:scale-[0.97] flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Chat with Aurelia
        </button>
      )}
    </div>
  );
}
