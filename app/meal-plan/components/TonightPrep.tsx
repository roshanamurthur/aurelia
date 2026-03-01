"use client";

import { useEffect, useState } from "react";

interface TonightPrepProps {
  recipeId: number;
  recipeTitle: string;
  recipeUrl: string;
  compact?: boolean;
}

interface GroceryItem {
  name: string;
  amount: string;
  section?: string;
}

export default function TonightPrep({ recipeId, recipeTitle, recipeUrl, compact }: TonightPrepProps) {
  const [ingredients, setIngredients] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recipeUrl || recipeUrl === "#") return;
    setLoading(true);
    setError(null);
    async function load() {
      try {
        // Try Spoonacular recipe ID first (API)
        const r1 = await fetch("/api/meal-plan/grocery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeIds: [recipeId] }),
        });
        const d1 = await r1.json();
        if (d1.error) throw new Error(d1.error);
        const flat1 = (d1.ingredients ?? []).map((i: { name: string; amount: string; section?: string }) => ({
          name: i.name,
          amount: i.amount || i.name,
          section: i.section,
        }));
        if (flat1.length > 0) {
          setIngredients(flat1);
          return;
        }
        // Fallback: extract directly from recipe URL (website)
        const r2 = await fetch("/api/meal-plan/extract-recipe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: recipeUrl }),
        });
        const d2 = await r2.json();
        if (d2.error) throw new Error(d2.error);
        const flat2 = (d2.ingredients ?? []).map((i: { name: string; amount: string }) => ({
          name: i.name,
          amount: i.amount || i.name,
        }));
        setIngredients(flat2);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load ingredients");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [recipeId, recipeUrl]);

  return (
    <div className={compact ? "" : "mt-2"}>
      {!compact && <p className="text-sm text-stone-600 dark:text-stone-400 mb-1.5">{recipeTitle}</p>}
      {loading ? (
        <p className="text-sm text-stone-500">Loading ingredients…</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : ingredients.length === 0 ? (
        <p className="text-sm text-stone-500">No ingredients found.</p>
      ) : (
        <ul className="space-y-1 text-sm text-stone-700 dark:text-stone-300 mb-3">
          {ingredients.slice(0, 12).map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-rust-500 shrink-0">&#9632;</span>
              <span>{item.amount || item.name}</span>
            </li>
          ))}
          {ingredients.length > 12 && (
            <li className="text-stone-500">+{ingredients.length - 12} more</li>
          )}
        </ul>
      )}
      <a
        href={recipeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-rust-600 hover:text-rust-700 dark:text-rust-400 dark:hover:text-rust-300"
      >
        Full recipe →
      </a>
    </div>
  );
}
