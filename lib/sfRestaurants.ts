/**
 * SF restaurants on OpenTable (matches data/sf-restaurants.csv).
 * Run `npm run sync-restaurants` after editing sf-restaurants.csv.
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

export function getDefaultTimeForRestaurant(restaurantName: string | undefined): string {
  if (!restaurantName?.trim()) return "19:00";
  const r = SF_RESTAURANTS.find(
    (x) => x.name.toLowerCase().trim() === restaurantName.toLowerCase().trim()
  );
  return r?.defaultTime ?? "19:00";
}
