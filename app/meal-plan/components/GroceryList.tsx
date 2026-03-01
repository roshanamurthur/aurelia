"use client";

import type { DayPlan } from "@/lib/types";
import { useEffect, useState } from "react";

interface GroceryListProps {
  days: DayPlan[];
  onClose: () => void;
}

interface GroceryItem {
  name: string;
  amount: string;
  recipes: string[];
  section?: string;
}

const STORE_ORDER = ["Produce", "Dairy & Eggs", "Meat & Seafood", "Pantry", "Baking", "Frozen", "Other"];

export default function GroceryList({ days, onClose }: GroceryListProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-stone-900 rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Grocery list</h2>
            {totalItems > 0 && displayLoading === false && (
              <p className="text-xs text-stone-500 mt-0.5">{totalItems} items by store section</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 flex items-center justify-center text-lg leading-none"
          >
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
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
                    <h3 className="text-sm font-semibold text-stone-600 dark:text-stone-400 mb-2">
                      {section}
                    </h3>
                    <ul className="space-y-1.5">
                      {items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-rust-500 mt-0.5">&#9632;</span>
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
