/**
 * SF restaurant meals with calories (matches data/sf-meals.csv).
 * Used for takeout calorie lookup when DB has no calories stored.
 */
export const SF_MEALS_CALORIES: Record<string, number> = {
  "Chipotle Chicken Bowl": 665,
  "Chipotle Steak Bowl": 680,
  "Chipotle Barbacoa Bowl": 665,
  "Chipotle Sofritas Bowl": 655,
  "Chipotle Veggie Bowl": 605,
  "Sweetgreen Guacamole Greens": 420,
  "Sweetgreen Harvest Bowl": 580,
  "Sweetgreen Kale Caesar": 520,
  "Souvla Chicken Gyro": 650,
  "Souvla Lamb Gyro": 720,
  "Souvla Greek Salad": 380,
  "Mendocino Farms Mendo Salad": 450,
  "Mendocino Farms Not So Fried Chicken Sandwich": 620,
  "Mendocino Farms Peruvian Steak Sandwich": 680,
  "Panera Broccoli Cheddar Soup": 360,
  "Panera Fuji Apple Salad": 380,
  "Panera Chipotle Chicken Avocado Melt": 640,
  "Panda Express Orange Chicken Bowl": 490,
  "Panda Express Kung Pao Chicken Bowl": 380,
  "Panda Express Beijing Beef Bowl": 420,
  "Blaze Pizza Build Your Own Pizza": 600,
  "Blaze Pizza Veggie Pizza": 520,
  "Shake Shack ShackBurger": 530,
  "Shake Shack Chicken Shack": 590,
  "Shake Shack Crinkle Cut Fries": 470,
  "Ike's Love and Sandwiches Dutch Crunch Club": 720,
  "Ike's Love and Sandwiches Menage a Trois": 680,
  "The Grove Caesar Salad": 420,
  "The Grove Turkey Club": 580,
  "Gordo Taqueria Super Steak Burrito": 750,
  "Gordo Taqueria Super Chicken Burrito": 680,
  "Gordo Taqueria Veggie Burrito": 620,
  "Mission Chinese Thrice Cooked Bacon Rice Cakes": 580,
  "Mission Chinese Mapo Tofu": 420,
  "Mission Chinese Salt Cod Fried Rice": 520,
  "SoMa Pizza Margherita Pizza": 680,
  "SoMa Pizza Pepperoni Pizza": 720,
  "Sushi Bistro Salmon Roll": 350,
  "Sushi Bistro Spicy Tuna Roll": 380,
  "Dumpling Home Xiao Long Bao": 320,
  "Dumpling Home Pan Fried Pork Dumplings": 420,
};

const SF_MEALS_NAMES = Object.keys(SF_MEALS_CALORIES) as string[];

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
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
  const slotKey = `${day}-${mealType}`;
  let hash = 0;
  for (let i = 0; i < slotKey.length; i++) {
    hash = (hash << 5) - hash + slotKey.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % SF_MEALS_NAMES.length;
  const name = SF_MEALS_NAMES[idx];
  return name ? SF_MEALS_CALORIES[name] : undefined;
}
