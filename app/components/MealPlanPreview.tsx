"use client";

/**
 * Renders a preview of the meal plan UI using the same structure as the real page.
 * Use this for landing page screenshots—or replace with actual screenshot images.
 */
const SAMPLE_DAYS = [
  { label: "Sun 2", dayName: "sunday" },
  { label: "Mon 3", dayName: "monday" },
  { label: "Tue 4", dayName: "tuesday" },
  { label: "Wed 5", dayName: "wednesday" },
];

const SAMPLE_MEALS: Record<string, Record<string, { name: string; cal: number; isTakeout?: "dd" | "ot" }>> = {
  sunday: {
    breakfast: { name: "Oatmeal with berries", cal: 320 },
    lunch: { name: "Caesar salad", cal: 420 },
    dinner: { name: "Falafel bowl", cal: 580, isTakeout: "dd" },
  },
  monday: {
    breakfast: { name: "Yogurt bowl", cal: 280 },
    lunch: { name: "Falafel wrap", cal: 450 },
    dinner: { name: "Pasta primavera", cal: 520 },
  },
  tuesday: {
    breakfast: { name: "Avocado toast", cal: 380 },
    lunch: { name: "Buddha bowl", cal: 480 },
    dinner: { name: "Grilled salmon", cal: 620, isTakeout: "dd" },
  },
  wednesday: {
    breakfast: { name: "Smoothie", cal: 250 },
    lunch: { name: "Tomato soup", cal: 320 },
    dinner: { name: "Date night out", cal: 0, isTakeout: "ot" },
  },
};

export default function MealPlanPreview({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-stone-200 bg-white p-4 shadow-lg ${className}`}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {SAMPLE_DAYS.map(({ label, dayName }) => {
          const meals = SAMPLE_MEALS[dayName] ?? {};
          const dayCal = Object.values(meals).reduce((a, m) => a + m.cal, 0);
          return (
            <div
              key={dayName}
              className="rounded-lg border border-stone-200/80 bg-stone-50/50 p-3 min-h-[200px] flex flex-col"
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-stone-800 text-sm">{label}</h3>
                {dayCal > 0 && (
                  <span className="text-xs font-medium text-rust-600">{Math.round(dayCal)} cal</span>
                )}
              </div>
              <div className="space-y-2 flex-1">
                {(["breakfast", "lunch", "dinner"] as const).map((mealType) => {
                  const m = meals[mealType];
                  if (!m) return null;
                  const isDD = m.isTakeout === "dd";
                  const isOT = m.isTakeout === "ot";
                  return (
                    <div
                      key={mealType}
                      className={`text-xs ${isDD || isOT ? "bg-amber-50/80 border-l-2 border-rust-400 pl-2 py-1 -ml-1" : ""}`}
                    >
                      <p className="text-stone-500 capitalize">{mealType}</p>
                      <p className="font-medium text-stone-800 truncate">{m.name}</p>
                      {m.cal > 0 && <p className="text-stone-400">{m.cal} cal</p>}
                      {(isDD || isOT) && (
                        <span className="text-[10px] text-rust-600 font-medium">
                          {isDD ? "DoorDash" : "OpenTable"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-3 justify-center text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-rust-400/60" /> DoorDash
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-rust-400/60" /> OpenTable
        </span>
      </div>
    </div>
  );
}
