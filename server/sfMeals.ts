/**
 * SF restaurant meals (matches data/sf-meals.csv).
 * Simple, searchable terms for DoorDash.
 */
export const SF_MEALS: { name: string; calories: number }[] = [
  { name: "Chipotle bowl", calories: 665 },
  { name: "Sweetgreen salad", calories: 510 },
  { name: "Souvla gyro", calories: 685 },
  { name: "Mendocino Farms sandwich", calories: 650 },
  { name: "Panera soup", calories: 360 },
  { name: "Panda Express bowl", calories: 430 },
  { name: "Blaze Pizza", calories: 560 },
  { name: "Shake Shack burger", calories: 560 },
  { name: "Little Caesars pizza", calories: 250 },
  { name: "Ike's sandwich", calories: 700 },
  { name: "Caesar salad", calories: 420 },
  { name: "Burrito", calories: 680 },
  { name: "Mission Chinese", calories: 510 },
  { name: "Pepperoni pizza", calories: 700 },
  { name: "Sushi roll", calories: 365 },
  { name: "Dumplings", calories: 370 },
];

/** Deterministic pick for a (day, mealType) slot — same slot always gets same meal. */
export function pickTakeoutMealForSlot(day: string, mealType: string): { name: string; calories: number } {
  const key = `${day}-${mealType}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % SF_MEALS.length;
  return SF_MEALS[idx]!;
}
