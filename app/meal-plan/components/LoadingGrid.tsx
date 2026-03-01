interface LoadingGridProps {
  numDays: number;
  mealsPerDay: number;
}

export default function LoadingGrid({ numDays, mealsPerDay }: LoadingGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: numDays }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm p-4 flex flex-col gap-3 animate-pulse"
        >
          <div className="h-3 bg-stone-200 dark:bg-stone-700 rounded w-2/3" />
          {Array.from({ length: mealsPerDay }).map((_, j) => (
            <div key={j} className="flex flex-col gap-2">
              <div className="h-32 bg-stone-200 dark:bg-stone-700 rounded-lg" />
              <div className="h-3 bg-stone-200 dark:bg-stone-700 rounded w-full" />
              <div className="h-3 bg-stone-200 dark:bg-stone-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
