"use client";

import SignOutButton from "@/app/components/SignOutButton";
import Chat from "@/app/components/Chat";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const LANDING_COPY =
  "Hi, I'm Aurelia. Together we'll build your weekly plan so you never have to think before you eat.";
const LANDING_PLACEHOLDER =
  "Calorie goals per meal, things you enjoy, allergies, cuisines you love...";

function Tag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-lg text-sm font-medium bg-rust-100 dark:bg-rust-900/40 text-rust-700 dark:text-rust-300 group transition-colors">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 opacity-60 hover:opacity-100 text-stone-500"
          aria-label={`Remove ${label}`}
        >
          &times;
        </button>
      )}
    </span>
  );
}

function PreferencesDashboard({ prefs }: { prefs: Record<string, any> }) {
  const hasAny =
    (prefs.dietaryRestrictions?.length ?? 0) > 0 ||
    (prefs.allergies?.length ?? 0) > 0 ||
    (prefs.cuisinePreferences?.length ?? 0) > 0 ||
    (prefs.excludedIngredients?.length ?? 0) > 0 ||
    (prefs.calorieTarget ?? 0) > 0 ||
    (prefs.proteinTargetGrams ?? 0) > 0 ||
    (prefs.householdSize ?? 0) > 1 ||
    (prefs.budgetPerWeek ?? 0) > 0 ||
    (prefs.mealSlots?.length ?? 0) > 0;
  if (!hasAny) return null;

  return (
    <div className="space-y-3">
      {(prefs.dietaryRestrictions?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Diet</p>
          <div className="flex flex-wrap gap-1">
            {prefs.dietaryRestrictions.map((d: string) => <Tag key={d} label={d} />)}
          </div>
        </div>
      )}
      {(prefs.allergies?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Allergies</p>
          <div className="flex flex-wrap gap-1">
            {prefs.allergies.map((a: string) => <Tag key={a} label={a} />)}
          </div>
        </div>
      )}
      {(prefs.cuisinePreferences?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Cuisines</p>
          <div className="flex flex-wrap gap-1">
            {prefs.cuisinePreferences.map((c: string) => <Tag key={c} label={c} />)}
          </div>
        </div>
      )}
      {(prefs.calorieTarget ?? 0) > 0 && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Calories</p>
          <span>{prefs.calorieTarget} cal/day</span>
        </div>
      )}
      {(prefs.proteinTargetGrams ?? 0) > 0 && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Protein</p>
          <span>{prefs.proteinTargetGrams}g/day</span>
        </div>
      )}
      {(prefs.excludedIngredients?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Excluded</p>
          <div className="flex flex-wrap gap-1">
            {prefs.excludedIngredients.map((i: string) => <Tag key={i} label={i} />)}
          </div>
        </div>
      )}
      {(prefs.householdSize ?? 0) > 1 && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Household</p>
          <span>{prefs.householdSize} people</span>
        </div>
      )}
      {(prefs.budgetPerWeek ?? 0) > 0 && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Budget</p>
          <span>${prefs.budgetPerWeek}/week</span>
        </div>
      )}
    </div>
  );
}

function Typewriter({ text }: { text: string }) {
  const [display, setDisplay] = useState("");
  const done = display.length >= text.length;
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setDisplay(text.slice(0, display.length + 1)), 35);
    return () => clearTimeout(t);
  }, [display, text, done]);
  return <span>{display}{!done && <span className="animate-pulse">|</span>}</span>;
}

export default function Home() {
  const [conversationStarted, setConversationStarted] = useState(false);
  const [initialMessage, setInitialMessage] = useState<string | undefined>();
  const [text, setText] = useState("");
  const [mouse, setMouse] = useState({ x: 50, y: 50 });
  const [scrollY, setScrollY] = useState(0);
  const [mobilePrefsOpen, setMobilePrefsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const preferences = useQuery(api.preferences.get);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      setMouse({ x: (e.clientX / window.innerWidth) * 100, y: (e.clientY / window.innerHeight) * 100 });
    };
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const scrollProgress = mainRef.current
    ? Math.min(1, scrollY / (mainRef.current.scrollHeight - window.innerHeight) || 0)
    : 0;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-rust-50 dark:bg-stone-950">
        <div className="flex gap-2">
          <span className="w-2 h-2 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  const showLanding = !conversationStarted;

  const bgStyle = showLanding
    ? `radial-gradient(ellipse ${120 + mouse.x * 0.5}% ${100 + mouse.y * 0.5}% at ${mouse.x}% ${mouse.y}%, rgba(220, 232, 242, 0.5), transparent 50%),
       radial-gradient(ellipse 80% 60% at ${100 - mouse.x * 0.3}% ${100 - mouse.y * 0.3}%, rgba(249, 232, 224, 0.5), transparent 40%),
       linear-gradient(135deg, #fdfbf8 0%, #f9f5f0 40%, #f5efe8 100%)`
    : `linear-gradient(180deg, #fdfbf8 ${scrollProgress * 15}%, #f9f5f0 ${25 + scrollProgress * 25}%, #f5efe8 100%)`;

  const handleLandingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setInitialMessage(trimmed);
    setConversationStarted(true);
    setText("");
  };

  return (
    <div
      ref={mainRef}
      className={`flex flex-col dark:bg-stone-950 ${showLanding ? "min-h-screen" : "h-screen overflow-hidden"}`}
      style={{
        background: showLanding
          ? "linear-gradient(-45deg, #fdf6f3 0%, #f0f5fa 25%, #f9e8e0 50%, #dce8f2 75%, #f2d4c8 100%)"
          : bgStyle,
        backgroundSize: showLanding ? "400% 400%" : undefined,
        animation: showLanding ? "gradient-shift 12s ease infinite" : undefined,
      }}
    >
      {showLanding ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-screen px-4">
          <div className="w-full max-w-lg text-center mb-8">
            <p className="text-base text-stone-500 dark:text-stone-400 mb-4 font-medium">
              Your weekly meal plan
            </p>
            <h1
              className="font-display text-2xl sm:text-3xl font-medium text-stone-800 dark:text-stone-100 leading-relaxed mb-4"
            >
              <Typewriter text={LANDING_COPY} />
            </h1>
            <p className="text-base text-stone-500 dark:text-stone-400 mb-8">
              Tell us what you like. We&apos;ll handle the rest.
            </p>
            <form onSubmit={handleLandingSubmit} className="w-full max-w-lg mb-4">
              <div className="flex gap-2 rounded-full bg-white/80 dark:bg-stone-900/50 backdrop-blur-md py-2 pl-6 pr-2 shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition-all duration-300 focus-within:bg-white/95 dark:focus-within:bg-stone-900/70">
                <input
                  ref={inputRef}
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={LANDING_PLACEHOLDER}
                  autoFocus
                  className="flex-1 bg-transparent py-3 text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 text-base focus:outline-none min-w-0"
                />
                <button
                  type="submit"
                  disabled={!text.trim()}
                  className="px-6 py-3 rounded-full bg-rust-500/90 hover:bg-rust-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-base transition-all active:scale-[0.98] shrink-0 shadow-sm shadow-rust-500/20"
                >
                  Go
                </button>
              </div>
            </form>
            <div className="mt-6 flex gap-4 justify-center">
              {isAuthenticated && (
                <SignOutButton className="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 bg-transparent border-none cursor-pointer font-normal">
                  Sign out
                </SignOutButton>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex h-screen overflow-hidden">
          <aside className="hidden lg:flex w-80 shrink-0 flex-col border-r border-stone-200/60 dark:border-stone-800 bg-white/70 dark:bg-stone-900/70 backdrop-blur-md shadow-sm">
            <div className="p-6 border-b border-stone-200/60 dark:border-stone-800">
              <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-200 tracking-tight mb-4">
                Preferences
              </h2>
              <div className="flex flex-col gap-2">
                <a
                  href="/meal-plan"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-left font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50/80 dark:bg-blue-950/30 hover:bg-blue-100/80 dark:hover:bg-blue-950/50 transition-all border border-blue-200/40 dark:border-blue-800/40"
                >
                  <span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm">&rarr;</span>
                  My plan
                </a>
                <SignOutButton className="flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm text-stone-500 hover:text-stone-700 hover:bg-stone-100/80 dark:text-stone-400 dark:hover:text-stone-300 dark:hover:bg-stone-800/80 transition-all border border-transparent">
                  <span className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-400 dark:text-stone-500 text-xs">&larr;</span>
                  Sign out
                </SignOutButton>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {preferences ? (
                <PreferencesDashboard prefs={preferences} />
              ) : (
                <p className="text-base text-stone-500 dark:text-stone-400 italic">Share your preferences in the chat</p>
              )}
            </div>
          </aside>

          <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-gradient-to-br from-[#fdfbf8] via-[#f9f5f0] to-[#f5efe6] dark:from-stone-950 dark:via-stone-900 dark:to-stone-950">
            <header className="lg:hidden shrink-0 px-5 py-4 flex items-center justify-between border-b border-stone-200/60 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setMobilePrefsOpen(true)}
                className="text-base font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                Preferences
              </button>
              <div className="flex items-center gap-3">
                <a href="/meal-plan" className="px-4 py-2 rounded-xl text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/50 transition-colors">My plan</a>
              </div>
            </header>

            {mobilePrefsOpen && (
              <div className="lg:hidden fixed inset-0 z-40" onClick={() => setMobilePrefsOpen(false)}>
                <div className="absolute inset-y-0 left-0 w-80 bg-white dark:bg-stone-900 shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="font-display text-lg font-semibold text-stone-800 dark:text-stone-200">Preferences</h2>
                    <button type="button" onClick={() => setMobilePrefsOpen(false)} className="w-10 h-10 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center text-xl transition-colors">&times;</button>
                  </div>
                  <div className="flex flex-col gap-2 mb-6">
                    <a href="/meal-plan" onClick={() => setMobilePrefsOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl text-left font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50/80 dark:bg-blue-950/30 hover:bg-blue-100/80 dark:hover:bg-blue-950/50 border border-blue-200/40 dark:border-blue-800/40">
                      <span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm">&rarr;</span>
                      My plan
                    </a>
                  </div>
                  {preferences ? (
                    <PreferencesDashboard prefs={preferences} />
                  ) : (
                    <p className="text-base text-stone-500 dark:text-stone-400 italic">Share in chat</p>
                  )}
                </div>
              </div>
            )}

            <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <Chat
                variant="full"
                onNavigate={(path) => router.push(path)}
                initialMessage={initialMessage}
              />
            </main>
          </div>
        </div>
      )}
    </div>
  );
}
