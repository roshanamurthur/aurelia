#!/usr/bin/env node
/**
 * Syncs data/sf-meals.csv → lib/sfMeals.ts so calorie counts update when the spreadsheet changes.
 * Run: npm run sync-meals
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.resolve(__dirname, "../data/sf-meals.csv");
const LIB_PATH = path.resolve(__dirname, "../lib/sfMeals.ts");

const csv = fs.readFileSync(CSV_PATH, "utf-8");
const lines = csv.trim().split("\n").slice(1);
const entries = [];
for (const line of lines) {
  const [name, calStr] = line.split(",").map((s) => s.trim());
  if (name && calStr) {
    const cal = parseInt(calStr, 10);
    if (!isNaN(cal)) entries.push([name, cal]);
  }
}

const content = `/**
 * SF restaurant meals with calories (matches data/sf-meals.csv).
 * Used for takeout calorie lookup when DB has no calories stored.
 * Run \`npm run sync-meals\` after editing sf-meals.csv.
 */
export const SF_MEALS_CALORIES: Record<string, number> = {
${entries.map(([n, c]) => `  "${n.replace(/"/g, '\\"')}": ${c}`).join(",\n")},
};

const SF_MEALS_NAMES = Object.keys(SF_MEALS_CALORIES) as string[];

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\\s+/g, " ");
}

export function getTakeoutCalories(recipeName: string | undefined): number | undefined {
  if (!recipeName?.trim()) return undefined;
  const key = normalize(recipeName);
  const exact = SF_MEALS_CALORIES[recipeName.trim()];
  if (exact != null) return exact;
  const ci = Object.entries(SF_MEALS_CALORIES).find(
    ([name]) => normalize(name) === key
  )?.[1];
  if (ci != null) return ci;
  const partial = Object.entries(SF_MEALS_CALORIES).find(
    ([name]) => normalize(name).includes(key) || key.includes(normalize(name))
  )?.[1];
  return partial;
}

/** Same deterministic pick as TakeoutOrderButton — for calorie totals on empty takeout slots. */
export function getCaloriesForSlot(day: string, mealType: string): number | undefined {
  const slotKey = \`\${day}-\${mealType}\`;
  let hash = 0;
  for (let i = 0; i < slotKey.length; i++) {
    hash = (hash << 5) - hash + slotKey.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % SF_MEALS_NAMES.length;
  const name = SF_MEALS_NAMES[idx];
  return name ? SF_MEALS_CALORIES[name] : undefined;
}
`;

fs.writeFileSync(LIB_PATH, content, "utf-8");
console.log(`Synced ${entries.length} meals from sf-meals.csv → lib/sfMeals.ts`);