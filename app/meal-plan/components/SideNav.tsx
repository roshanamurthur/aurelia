"use client";

type View = "week" | "day" | "grocery";

interface SideNavProps {
  currentView: View;
  onNavigate: (view: View) => void;
  selectedDayLabel?: string | null;
}

export default function SideNav({ currentView, onNavigate, selectedDayLabel }: SideNavProps) {
  const base = "w-48 shrink-0 flex flex-col gap-1 py-6 px-4 border-r border-stone-200/80 dark:border-stone-700/80 bg-stone-50/50 dark:bg-stone-900/50";
  const btn = (v: View, label: string) => {
    const active = currentView === v;
    return (
      <button
        type="button"
        onClick={() => onNavigate(v)}
        className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors truncate ${
          active
            ? "bg-rust-500 text-white"
            : "text-stone-600 dark:text-stone-400 hover:bg-stone-200/60 dark:hover:bg-stone-700/60 hover:text-stone-900 dark:hover:text-stone-100"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <nav className={base}>
      {btn("week", "Week")}
      {selectedDayLabel && btn("day", selectedDayLabel)}
      {btn("grocery", "Grocery")}
    </nav>
  );
}
