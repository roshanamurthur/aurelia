"use client";

import { useEffect, useState } from "react";

const EXAMPLE =
  "I want high protein, under 600 cal per meal, no mushrooms, Mediterranean 2x a week, DoorDash on Fridays. Also 30 min or less, use leftover chicken, no Italian, low carb.";

interface ExtractedConstraints {
  excludeIngredients: string[];
  includeIngredients: string[];
  preferredCuisines: string[];
  excludeCuisine: string[];
  diet: string;
  intolerances: string[];
  calorieRange: { min: number; max: number };
  proteinTarget: number;
  carbRange?: { min: number; max: number };
  fatRange?: { min: number; max: number };
  maxReadyTime?: number;
  mealTypes?: string[];
  takeoutDays: string[];
}

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
      {label}
    </span>
  );
}

function ConstraintSummary({ extracted }: { extracted: ExtractedConstraints }) {
  return (
    <div className="space-y-3 text-sm">
      {extracted.calorieRange?.max > 0 && (
        <div className="flex gap-2 items-start">
          <span className="text-stone-400 w-28 shrink-0">Calories</span>
          <span>{extracted.calorieRange.min}–{extracted.calorieRange.max} kcal/meal</span>
        </div>
      )}
      {extracted.proteinTarget > 0 && (
        <div className="flex gap-2 items-start">
          <span className="text-stone-400 w-28 shrink-0">Protein</span>
          <span>{extracted.proteinTarget}g min</span>
        </div>
      )}
      {extracted.carbRange && extracted.carbRange.max < 999 && (
        <div className="flex gap-2 items-start">
          <span className="text-stone-400 w-28 shrink-0">Carbs</span>
          <span>max {extracted.carbRange.max}g</span>
        </div>
      )}
      {extracted.maxReadyTime && extracted.maxReadyTime > 0 && (
        <div className="flex gap-2 items-start">
          <span className="text-stone-400 w-28 shrink-0">Cook time</span>
          <span>{extracted.maxReadyTime} min max</span>
        </div>
      )}
      {extracted.preferredCuisines?.length > 0 && (
        <div className="flex gap-2 items-start">
          <span className="text-stone-400 w-28 shrink-0">Cuisines</span>
          <div className="flex flex-wrap gap-1">
            {extracted.preferredCuisines.map((c) => <Tag key={c} label={c} />)}
          </div>
        </div>
      )}
      {extracted.excludeCuisine?.length > 0 && (
        <div className="flex gap-2 items-start">
          <span className="text-stone-400 w-28 shrink-0">Exclude cuisine</span>
          <div className="flex flex-wrap gap-1">
            {extracted.excludeCuisine.map((c) => <Tag key={c} label={c} />)}
          </div>
        </div>
      )}
      {extracted.includeIngredients?.length > 0 && (
        <div className="flex gap-2 items-start">
          <span className="text-stone-400 w-28 shrink-0">Must include</span>
          <div className="flex flex-wrap gap-1">
            {extracted.includeIngredients.map((i) => <Tag key={i} label={i} />)}
          </div>
        </div>
      )}
      {extracted.excludeIngredients?.length > 0 && (
        <div className="flex gap-2 items-start">
          <span className="text-stone-400 w-28 shrink-0">Exclude</span>
          <div className="flex flex-wrap gap-1">
            {extracted.excludeIngredients.map((i) => <Tag key={i} label={i} />)}
          </div>
        </div>
      )}
      {extracted.takeoutDays?.length > 0 && (
        <div className="flex gap-2 items-start">
          <span className="text-stone-400 w-28 shrink-0">Takeout days</span>
          <div className="flex flex-wrap gap-1">
            {extracted.takeoutDays.map((d) => <Tag key={d} label={d} />)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedConstraints | null>(null);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasExisting, setHasExisting] = useState(false);

  useEffect(() => {
    fetch("/api/preferences?userId=demo")
      .then((r) => r.json())
      .then((d) => setHasExisting(!!d.preferences))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setExtracted(null);
    setSaved(null);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), userId: "demo" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setExtracted(data.extracted);
      setSaved(data.saved ?? false);
      setHasExisting(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Aurelia</h1>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
              Tell us your goals, we'll plan your week
            </p>
          </div>
          {hasExisting && (
            <a
              href="/meal-plan"
              className="text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 transition-colors"
            >
              View Meal Plan →
            </a>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="goals"
              className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2"
            >
              Your dietary goals &amp; preferences
            </label>
            <textarea
              id="goals"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. high protein, under 600 cal, no mushrooms, Mediterranean 2x/week, DoorDash Fridays, 30 min or less, no Italian, low carb."
              rows={4}
              className="w-full rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-4 py-3 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 resize-none"
              disabled={loading}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading || !text.trim()}
              className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 dark:disabled:bg-stone-700 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
            >
              {loading ? "Saving…" : "Save Preferences"}
            </button>
            <button
              type="button"
              onClick={() => setText(EXAMPLE)}
              disabled={loading}
              className="px-5 py-2.5 rounded-lg border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium text-sm transition-colors"
            >
              Try example
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {extracted && saved && (
          <div className="mt-8 space-y-6">
            <section className="p-5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm">
              <h2 className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-4">
                Understood preferences
              </h2>
              <ConstraintSummary extracted={extracted} />
            </section>

            <a
              href="/meal-plan"
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition-colors shadow-sm"
            >
              Generate My Meal Plan →
            </a>
          </div>
        )}

        {extracted && saved === false && (
          <div className="mt-6 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm">
            Preferences extracted but not saved (MongoDB not configured).
          </div>
        )}
      </main>
    </div>
  );
}
