export default function MealPlanLoading() {
  return (
    <div
      className="min-h-screen flex flex-col text-stone-900 dark:text-stone-100 font-sans"
      style={{
        background: "linear-gradient(135deg, #fdfbf8 0%, #f9f5f0 30%, #f5efe8 50%, #f0f5fa 100%)",
      }}
    >
      <header className="bg-white/60 dark:bg-stone-900/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="h-8 w-24 bg-stone-200 dark:bg-stone-700 rounded animate-pulse" />
          <div className="flex gap-4">
            <div className="h-4 w-16 bg-stone-200 dark:bg-stone-700 rounded animate-pulse" />
            <div className="h-4 w-14 bg-stone-200 dark:bg-stone-700 rounded animate-pulse" />
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-6">
        <div className="mb-6">
          <div className="h-10 w-64 bg-stone-200 dark:bg-stone-700 rounded animate-pulse mb-2" />
          <div className="h-4 w-48 bg-stone-100 dark:bg-stone-800 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl bg-white/70 dark:bg-stone-900/70 border border-stone-200/60 dark:border-stone-700/60 p-4 animate-pulse"
            >
              <div className="h-10 w-10 rounded-full bg-stone-200 dark:bg-stone-700 mb-3" />
              <div className="h-4 w-16 bg-stone-200 dark:bg-stone-700 rounded mb-2" />
              <div className="h-3 w-full bg-stone-100 dark:bg-stone-800 rounded mb-2" />
              <div className="h-3 w-3/4 bg-stone-100 dark:bg-stone-800 rounded mb-2" />
              <div className="h-3 w-1/2 bg-stone-100 dark:bg-stone-800 rounded" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
