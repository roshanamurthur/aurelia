"use client";

interface NutritionRingProps {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  targetCal?: number;
  size?: number;
}

export default function NutritionRing({
  calories,
  protein,
  carbs,
  fat,
  targetCal = 0,
  size = 80,
}: NutritionRingProps) {
  const proteinCal = protein * 4;
  const carbCal = carbs * 4;
  const fatCal = fat * 9;
  const totalCal = proteinCal + carbCal + fatCal;
  const pctP = totalCal > 0 ? proteinCal / totalCal : 0;
  const pctC = totalCal > 0 ? carbCal / totalCal : 0;
  const pctF = totalCal > 0 ? fatCal / totalCal : 0;

  const stroke = size * 0.12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  const dashP = circumference * pctP;
  const dashC = circumference * pctC;
  const dashF = circumference * pctF;

  const segments = [
    { dash: dashP, color: "#4a7a9a", offset: 0 },
    { dash: dashC, color: "#8ab3d4", offset: dashP },
    { dash: dashF, color: "#c87050", offset: dashP + dashC },
  ].filter((s) => s.dash > 0);

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {segments.map((s, i) => (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={s.dash}
              strokeDashoffset={-s.offset}
              strokeLinecap="round"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-base font-semibold text-stone-800 dark:text-stone-200">
            {Math.round(calories)}
          </span>
          <span className="text-xs text-stone-500 dark:text-stone-400">kcal</span>
        </div>
      </div>
        <div className="flex flex-col gap-1 text-base text-stone-700 dark:text-stone-300">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#4a7a9a" }} />
          <span className="text-stone-600 dark:text-stone-400">{Math.round(protein)}g protein</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#8ab3d4" }} />
          <span className="text-stone-600 dark:text-stone-400">{Math.round(carbs)}g carbs</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#c87050" }} />
          <span className="text-stone-600 dark:text-stone-400">{Math.round(fat)}g fat</span>
        </span>
        {targetCal > 0 && (
          <span className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            {Math.round((calories / targetCal) * 100)}% of goal
          </span>
        )}
      </div>
    </div>
  );
}
