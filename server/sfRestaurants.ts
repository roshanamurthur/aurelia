/**
 * SF restaurants on OpenTable (matches data/sf-restaurants.csv).
 * Deterministic pick for dine-out slots.
 */
export const SF_RESTAURANTS: { name: string; defaultTime: string }[] = [
  { name: "House of Prime Rib", defaultTime: "19:00" },
  { name: "Kokkari Estiatorio", defaultTime: "19:00" },
  { name: "State Bird Provisions", defaultTime: "19:00" },
  { name: "Rich Table", defaultTime: "19:00" },
  { name: "The Progress", defaultTime: "19:00" },
  { name: "Octavia", defaultTime: "19:00" },
  { name: "Gary Danko", defaultTime: "19:00" },
  { name: "Nisei", defaultTime: "19:00" },
  { name: "Boulevard", defaultTime: "19:00" },
  { name: "Spruce", defaultTime: "19:00" },
  { name: "Wayfare Tavern", defaultTime: "19:00" },
  { name: "Foreign Cinema", defaultTime: "19:00" },
  { name: "Original Joe's - San Francisco", defaultTime: "19:00" },
  { name: "Dalida", defaultTime: "19:00" },
  { name: "Niku Steakhouse", defaultTime: "19:00" },
  { name: "Trestle", defaultTime: "19:00" },
];

/** Deterministic pick for a (day, mealType) slot — same slot always gets same restaurant. */
export function pickRestaurantForSlot(day: string, mealType: string): { name: string; defaultTime: string } {
  const key = `${day}-${mealType}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % SF_RESTAURANTS.length;
  return SF_RESTAURANTS[idx]!;
}
