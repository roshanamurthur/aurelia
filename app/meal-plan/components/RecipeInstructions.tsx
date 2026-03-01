"use client";

import { useEffect, useState } from "react";

interface RecipeInstructionsProps {
  recipeId: number;
}

export default function RecipeInstructions({ recipeId }: RecipeInstructionsProps) {
  const [steps, setSteps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    });
    fetch(`/api/meal-plan/instructions?recipeId=${recipeId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        if (!cancelled) setSteps(d.steps ?? []);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [recipeId]);

  if (loading) return <p className="text-sm text-stone-500">Loading instructions…</p>;
  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (steps.length === 0) return <p className="text-sm text-stone-500">No instructions available.</p>;

  return (
    <ol className="space-y-3 list-none">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-rust-500/20 text-rust-700 dark:text-rust-300 text-xs font-semibold flex items-center justify-center">
            {i + 1}
          </span>
          <span className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">{step}</span>
        </li>
      ))}
    </ol>
  );
}
