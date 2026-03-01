"use client";

import type { DayPlan } from "@/lib/types";
import { useEffect, useState } from "react";

interface GroceryListPanelProps {
  days: DayPlan[];
}

interface GroceryItem {
  name: string;
  amount: string;
  recipes: string[];
  section?: string;
}

const STORE_ORDER = ["Produce", "Dairy & Eggs", "Meat & Seafood", "Pantry", "Baking", "Frozen", "Other"];

export default function GroceryListPanel({ days }: GroceryListPanelProps) {
  const [bySection, setBySection] = useState<Record<string, GroceryItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recipeIds = days.flatMap((d) =>
    (d.meals ?? [])
      .filter((m) => m.recipe?.id)
      .map((m) => m.recipe!.id)
  );
  const uniqueIds = [...new Set(recipeIds)].sort((a, b) => a - b);
  const isEmpty = uniqueIds.length === 0;
  const idsKey = uniqueIds.join(",");

  useEffect(() => {
    if (isEmpty) return;
    const tid = setTimeout(() => {
      setLoading(true);
      setError(null);
    }, 0);
    fetch("/api/meal-plan/grocery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeIds: uniqueIds }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setBySection(d.bySection ?? {});
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => clearTimeout(tid);
  }, [idsKey, isEmpty]);

  const displayBySection = isEmpty ? {} : bySection;
  const displayLoading = isEmpty ? false : loading;
  const totalItems = Object.values(displayBySection).flat().length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-stone-900 dark:text-stone-100">Grocery List</h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
            {totalItems > 0 ? `${totalItems} items for the week` : "All ingredients for your planned meals"}
          </p>
        </div>
        <button
          type="button"
          disabled={totalItems === 0}
          title="Coming soon"
          className="px-4 py-2 rounded-lg bg-rust-500/85 hover:bg-rust-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          Order groceries
        </button>
      </div>
      <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white/70 dark:bg-stone-900/70 overflow-hidden">
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {displayLoading ? (
            <p className="text-sm text-stone-500">Loading ingredients…</p>
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : totalItems === 0 ? (
            <p className="text-sm text-stone-500">No recipes with ingredients found.</p>
          ) : (
            <div className="space-y-5">
              {STORE_ORDER.map((section) => {
                const items = displayBySection[section] ?? [];
                if (items.length === 0) return null;
                return (
                  <div key={section}>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
                      {section}
                    </h3>
                    <ul className="space-y-1.5">
                      {items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-rust-500 mt-0.5 shrink-0">&#9632;</span>
                          <span className="flex-1">{item.amount || item.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
