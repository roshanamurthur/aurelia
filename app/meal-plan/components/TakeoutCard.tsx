interface TakeoutCardProps {
  dayName: string;
}

export default function TakeoutCard({ dayName }: TakeoutCardProps) {
  const capitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  return (
    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-center flex flex-col gap-1">
      <span className="text-2xl" aria-hidden="true">&#127829;</span>
      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Takeout Day</p>
      <p className="text-xs text-amber-600 dark:text-amber-500">Enjoy your {capitalized}!</p>
    </div>
  );
}
