/**
 * SF restaurant meals (matches data/sf-meals.csv).
 * Use exact names when creating takeout meals — never generic labels like "Mexican takeout".
 */
export const SF_MEALS: { name: string; calories: number }[] = [
  { name: "Chipotle Chicken Bowl", calories: 665 },
  { name: "Chipotle Steak Bowl", calories: 680 },
  { name: "Chipotle Barbacoa Bowl", calories: 665 },
  { name: "Chipotle Sofritas Bowl", calories: 655 },
  { name: "Chipotle Veggie Bowl", calories: 605 },
  { name: "Sweetgreen Guacamole Greens", calories: 420 },
  { name: "Sweetgreen Harvest Bowl", calories: 580 },
  { name: "Sweetgreen Kale Caesar", calories: 520 },
  { name: "Souvla Chicken Gyro", calories: 650 },
  { name: "Souvla Lamb Gyro", calories: 720 },
  { name: "Souvla Greek Salad", calories: 380 },
  { name: "Mendocino Farms Mendo Salad", calories: 450 },
  { name: "Mendocino Farms Not So Fried Chicken Sandwich", calories: 620 },
  { name: "Mendocino Farms Peruvian Steak Sandwich", calories: 680 },
  { name: "Panera Broccoli Cheddar Soup", calories: 360 },
  { name: "Panera Fuji Apple Salad", calories: 380 },
  { name: "Panera Chipotle Chicken Avocado Melt", calories: 640 },
  { name: "Panda Express Orange Chicken Bowl", calories: 490 },
  { name: "Panda Express Kung Pao Chicken Bowl", calories: 380 },
  { name: "Panda Express Beijing Beef Bowl", calories: 420 },
  { name: "Blaze Pizza Build Your Own Pizza", calories: 600 },
  { name: "Blaze Pizza Veggie Pizza", calories: 520 },
  { name: "Shake Shack ShackBurger", calories: 530 },
  { name: "Shake Shack Chicken Shack", calories: 590 },
  { name: "Shake Shack Crinkle Cut Fries", calories: 470 },
  { name: "Ike's Love and Sandwiches Dutch Crunch Club", calories: 720 },
  { name: "Ike's Love and Sandwiches Menage a Trois", calories: 680 },
  { name: "The Grove Caesar Salad", calories: 420 },
  { name: "The Grove Turkey Club", calories: 580 },
  { name: "Gordo Taqueria Super Steak Burrito", calories: 750 },
  { name: "Gordo Taqueria Super Chicken Burrito", calories: 680 },
  { name: "Gordo Taqueria Veggie Burrito", calories: 620 },
  { name: "Mission Chinese Thrice Cooked Bacon Rice Cakes", calories: 580 },
  { name: "Mission Chinese Mapo Tofu", calories: 420 },
  { name: "Mission Chinese Salt Cod Fried Rice", calories: 520 },
  { name: "SoMa Pizza Margherita Pizza", calories: 680 },
  { name: "SoMa Pizza Pepperoni Pizza", calories: 720 },
  { name: "Sushi Bistro Salmon Roll", calories: 350 },
  { name: "Sushi Bistro Spicy Tuna Roll", calories: 380 },
  { name: "Dumpling Home Xiao Long Bao", calories: 320 },
  { name: "Dumpling Home Pan Fried Pork Dumplings", calories: 420 },
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
