interface LoadingGridProps {
  numDays: number;
  mealsPerDay: number;
}

export default function LoadingGrid({ numDays, mealsPerDay }: LoadingGridProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 mt-6">
      {Array.from({ length: numDays }).map((_, i) => (
        <div
          key={i}
          className="shrink-0 w-[260px] rounded-xl bg-white/90 dark:bg-stone-900/90 border border-stone-200/60 dark:border-stone-700/50 shadow-sm p-3 animate-pulse"
        >
          <div className="h-3 bg-stone-200 dark:bg-stone-700 rounded w-2/3 mb-3" />
          {Array.from({ length: mealsPerDay }).map((_, j) => (
            <div key={j} className="py-2 border-b border-stone-100 dark:border-stone-800 last:border-0">
              <div className="h-2 bg-stone-200 dark:bg-stone-700 rounded w-1/4 mb-1" />
              <div className="h-3 bg-stone-200 dark:bg-stone-700 rounded w-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
