# Meal Source Integration Guide

This is the canonical reference for adding new meal sources to Aurelia's planning engine.

## What is a MealSource?

A `MealSource` is any provider that can fill a `MealSlot` in the weekly plan.

| Source | Status | Description |
|---|---|---|
| `spoonacular` | Active | Recipe search API — home-cooked meals |
| `takeout` | Active | Designated takeout days (no API call) |
| `doordash` | Planned | On-demand food delivery |
| `instacart` | Planned | Grocery delivery / ingredient sourcing |
| `homecook` | Planned | User's own saved recipes |

---

## How to Add a New Source (step-by-step)

### 1. Add to the `MealSource` union type in `lib/types.ts`

```typescript
export type MealSource = "spoonacular" | "takeout" | "doordash" | "instacart" | "homecook" | "your-source";
```

### 2. Create a resolver function in `lib/sources/your-source.ts`

```typescript
import type { MealSlot, UserPreferences } from "../types";

export async function resolveYourSourceSlot(
  slot: MealSlot,
  prefs: UserPreferences
): Promise<MealSlot> {
  // Fetch from your API, populate slot.recipe or set type="empty"
  // Must return a complete MealSlot
}
```

### 3. Register it in `resolveSlot()` in `lib/planning-engine.ts`

```typescript
case "your-source": return resolveYourSourceSlot(slot, prefs);
```

### 4. Add source assignment logic to `generateWeeklyPlan()` in `lib/planning-engine.ts`

Before slot stubs are created, mark the appropriate slots with `source: "your-source"`.

Example for DoorDash (2 meals/week):
```typescript
// Mark random non-takeout slots as doordash based on prefs.weeklyMix.doordash
const doordashCount = prefs.weeklyMix?.doordash ?? 0;
// assign to first N non-takeout slots
```

### 5. Add env var for the source's API key

In `.env.local`:
```
YOUR_SOURCE_API_KEY=your_key_here
```

In `next.config.ts`, add to `env`:
```typescript
YOUR_SOURCE_API_KEY: process.env.YOUR_SOURCE_API_KEY,
```

### 6. Update intake LLM prompt in `app/api/intake/route.ts`

Add extraction for source preferences, e.g.:
```
"order DoorDash twice a week" → weeklyMix.doordash: 2
```

---

## Source Priority / Fallback Order

```
takeout days     → source: "takeout"      (no API call)
weeklyMix.doordash → source: "doordash"  (future)
remaining days   → source: "spoonacular"
if spoonacular fails → type: "empty"
```

---

## DoorDash Integration Notes

- **API**: DoorDash Drive API or Storefront API
- **Slot assignment**: match `prefs.takeoutDays` or `prefs.weeklyMix.doordash` count
- **Recipe equivalent**: `DoorDashOrder { restaurant, items[], estimatedTotal, deliveryTime }`
- `MealSlot.recipe` stays null; add `MealSlot.externalOrder?: ExternalOrder`

```typescript
export interface ExternalOrder {
  source: "doordash" | "instacart";
  providerOrderId?: string;
  displayName: string;        // "DoorDash from Chipotle"
  items: string[];
  estimatedCalories?: number;
  estimatedCost?: number;
  orderUrl?: string;
}
```

---

## Instacart Integration Notes

- **API**: Instacart Storefront API
- **Key difference**: Instacart sources *ingredients*, not prepared meals
- The planning engine still selects recipes via Spoonacular first, then generates an Instacart cart from the ingredient lists
- Slot assignment: used for "grocery shop" days — fills multiple meals from one shop

---

## Nutrition Handling per Source

| Source | Nutrition data | How to get it |
|---|---|---|
| spoonacular | Full nutrients array | Spoonacular API response |
| doordash | Estimated | Menu item nutrition from DoorDash API |
| instacart | From recipes | Still planned via Spoonacular; Instacart just shops |
| takeout | None | User can optionally log manually |

---

## Adding a New `MealType`

If you need a new meal type (e.g., `"brunch"`):

1. Add to `MealType` union in `lib/types.ts`
2. Add a split weight to `MEAL_TYPE_SPLITS` in `lib/planning-engine.ts`
3. Add a Spoonacular type mapping to `SPOONACULAR_TYPE_MAP` in `lib/planning-engine.ts`
4. Update `defaultMealTypes()` if it should be included in defaults
