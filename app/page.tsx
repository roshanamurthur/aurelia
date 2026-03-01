"use client";

import SignOutButton from "@/app/components/SignOutButton";
import type { ExtractedConstraints } from "@/lib/types";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

const LANDING_COPY =
  "Hi, I'm Aurelia. Together we'll build your weekly plan so you never have to think before you eat.";
const LANDING_PLACEHOLDER =
  "Calorie goals per meal, things you enjoy, allergies, cuisines you love...";
const GREETING_WITH_PREFS = "Welcome back. What would you like to add or change?";

const SAMPLE_PREFS: ExtractedConstraints = {
  excludeIngredients: [],
  preferredCuisines: ["mediterranean", "mexican"],
  excludeCuisine: [],
  diet: "vegetarian",
  intolerances: [],
  calorieRange: { min: 0, max: 600 },
  proteinTarget: 40,
  carbRange: { min: 0, max: 999 },
  fatRange: { min: 0, max: 999 },
  sodiumRange: { min: 0, max: 9999 },
  sugarRange: { min: 0, max: 999 },
  maxReadyTime: 30,
  mealTypes: [],
  equipment: [],
  servingRange: { min: 0, max: 0 },
  query: "",
  sortPreference: "",
  sortDirection: "asc",
  takeoutDays: ["friday"],
  dailyCalorieTarget: 0,
  dailyProteinTarget: 0,
  dailyCarbTarget: 0,
  dailyFatTarget: 0,
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

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

interface PreferencesDashboardProps {
  prefs: ExtractedConstraints;
  onUpdate?: (updates: Partial<ExtractedConstraints>) => void;
}

function PreferencesDashboard({ prefs, onUpdate }: PreferencesDashboardProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const hasAny =
    (prefs.calorieRange?.max ?? 0) > 0 ||
    (prefs.proteinTarget ?? 0) > 0 ||
    (prefs.carbRange?.max ?? 0) < 999 ||
    (prefs.maxReadyTime ?? 0) > 0 ||
    (prefs.preferredCuisines?.length ?? 0) > 0 ||
    (prefs.excludeCuisine?.length ?? 0) > 0 ||
    (prefs.excludeIngredients?.length ?? 0) > 0 ||
    (prefs.takeoutDays?.length ?? 0) > 0 ||
    (prefs.diet?.length ?? 0) > 0 ||
    (prefs.intolerances?.length ?? 0) > 0;
  if (!hasAny) return null;

  const save = (field: string, value: unknown) => {
    setEditing(null);
    onUpdate?.({ [field]: value } as Partial<ExtractedConstraints>);
  };

  const EditableNumber = ({
    field,
    value,
    display,
    min = 0,
    max = 999,
  }: {
    field: string;
    value: number;
    display: string;
    min?: number;
    max?: number;
  }) => (
    <span
      className="cursor-pointer hover:underline underline-offset-2 transition-colors"
      onClick={() => {
        setEditing(field);
        setEditVal(String(value));
      }}
    >
      {editing === field ? (
        <input
          type="number"
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={() => {
            const n = parseInt(editVal, 10);
            if (!isNaN(n) && n >= min && n <= max) save(field, n);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const n = parseInt(editVal, 10);
              if (!isNaN(n) && n >= min && n <= max) save(field, n);
            }
          }}
          autoFocus
          className="w-20 px-2 py-1 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-base"
        />
      ) : (
        display
      )}
    </span>
  );

  const EditableText = ({ field, value }: { field: string; value: string }) => (
    <span
      className="cursor-pointer hover:underline underline-offset-2 transition-colors"
      onClick={() => {
        setEditing(field);
        setEditVal(value);
      }}
    >
      {editing === field ? (
        <input
          type="text"
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={() => {
            if (editVal.trim()) save(field, editVal.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && editVal.trim()) save(field, editVal.trim());
          }}
          autoFocus
          className="px-2 py-1 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-base min-w-[100px]"
        />
      ) : (
        <Tag label={value} />
      )}
    </span>
  );

  const EditableTags = ({
    field,
    items,
    placeholder,
  }: {
    field: string;
    items: string[];
    placeholder: string;
  }) => {
    const [addVal, setAddVal] = useState("");
    return (
      <div className="flex flex-wrap gap-1 items-center">
        {items.map((i) => (
          <Tag key={i} label={i} onRemove={() => save(field, items.filter((x) => x !== i))} />
        ))}
        {editing === field ? (
          <input
            type="text"
            value={addVal}
            onChange={(e) => setAddVal(e.target.value)}
            onBlur={() => {
              if (addVal.trim()) save(field, [...items, addVal.trim().toLowerCase()]);
              setAddVal("");
              setEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && addVal.trim()) {
                save(field, [...items, addVal.trim().toLowerCase()]);
                setAddVal("");
                setEditing(null);
              }
            }}
            placeholder={placeholder}
            autoFocus
            className="w-24 px-2 py-1 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm"
          />
        ) : (
            <button
              type="button"
              onClick={() => setEditing(field)}
              className="text-stone-500 hover:text-blue-600 dark:hover:text-blue-400 text-sm font-medium transition-colors"
            >
            + add
          </button>
        )}
      </div>
    );
  };

  const EditableCalorieRange = () => {
    const min = prefs.calorieRange?.min ?? 0;
    const max = prefs.calorieRange?.max ?? 0;
    const [minVal, setMinVal] = useState(String(min));
    const [maxVal, setMaxVal] = useState(String(max));
    if (editing === "calorieRange") {
      return (
        <span className="flex gap-1 items-center">
          <input
            type="number"
            value={minVal}
            onChange={(e) => setMinVal(e.target.value)}
            className="w-16 px-2 py-1 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-base"
          />
          <span className="text-stone-400">to</span>
          <input
            type="number"
            value={maxVal}
            onChange={(e) => setMaxVal(e.target.value)}
            onBlur={() => {
              const mn = parseInt(minVal, 10);
              const mx = parseInt(maxVal, 10);
              if (!isNaN(mn) && !isNaN(mx) && mn >= 0 && mx <= 2000) {
                save("calorieRange", { min: mn, max: mx });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const mn = parseInt(minVal, 10);
                const mx = parseInt(maxVal, 10);
                if (!isNaN(mn) && !isNaN(mx) && mn >= 0 && mx <= 2000) {
                  save("calorieRange", { min: mn, max: mx });
                }
              }
            }}
            autoFocus
            className="w-16 px-2 py-1 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-base"
          />
          <span className="text-stone-500 text-sm">/meal</span>
        </span>
      );
    }
    return (
      <span
        className="cursor-pointer hover:underline underline-offset-2 transition-colors"
        onClick={() => {
          setMinVal(String(min));
          setMaxVal(String(max));
          setEditing("calorieRange");
        }}
      >
        {min} to {max}/meal
      </span>
    );
  };

  return (
    <div className="space-y-3">
      {prefs.diet && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Diet</p>
          <EditableText field="diet" value={prefs.diet} />
        </div>
      )}
      {(prefs.intolerances?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Avoid</p>
          <EditableTags field="intolerances" items={prefs.intolerances} placeholder="add" />
        </div>
      )}
      {(prefs.calorieRange?.max ?? 0) > 0 && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Calories</p>
          <EditableCalorieRange />
        </div>
      )}
      {(prefs.proteinTarget ?? 0) > 0 && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Protein</p>
          <EditableNumber field="proteinTarget" value={prefs.proteinTarget} display={`${prefs.proteinTarget}g+`} max={200} />
        </div>
      )}
      {prefs.carbRange?.max && prefs.carbRange.max < 999 && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Carbs</p>
          <span
            className="cursor-pointer hover:underline underline-offset-2 transition-colors"
            onClick={() => {
              setEditing("carbRange");
              setEditVal(String(prefs.carbRange!.max));
            }}
          >
            {editing === "carbRange" ? (
              <input
                type="number"
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                onBlur={() => {
                  const n = parseInt(editVal, 10);
                  if (!isNaN(n) && n >= 0 && n <= 500) {
                    save("carbRange", { ...prefs.carbRange!, max: n });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const n = parseInt(editVal, 10);
                    if (!isNaN(n) && n >= 0 && n <= 500) {
                      save("carbRange", { ...prefs.carbRange!, max: n });
                    }
                  }
                }}
                autoFocus
                className="w-20 px-2 py-1 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-base"
              />
            ) : (
              `max ${prefs.carbRange.max}g`
            )}
          </span>
        </div>
      )}
      {(prefs.preferredCuisines?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Cuisines</p>
          <EditableTags field="preferredCuisines" items={prefs.preferredCuisines} placeholder="cuisine" />
        </div>
      )}
      {(prefs.maxReadyTime ?? 0) > 0 && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Cook time</p>
          <EditableNumber field="maxReadyTime" value={prefs.maxReadyTime} display={`${prefs.maxReadyTime} min max`} max={300} />
        </div>
      )}
      {(prefs.takeoutDays?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-stone-200/60 dark:border-stone-700/50 bg-stone-50/50 dark:bg-stone-800/30 p-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1.5">Takeout</p>
          <EditableTags field="takeoutDays" items={prefs.takeoutDays} placeholder="day" />
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

function prefsToConstraints(doc: Record<string, unknown> | null): ExtractedConstraints | null {
  if (!doc) return null;
  return {
    excludeIngredients: (doc.excludeIngredients as string[]) ?? [],
    preferredCuisines: (doc.preferredCuisines as string[]) ?? [],
    excludeCuisine: (doc.excludeCuisine as string[]) ?? [],
    diet: (doc.diet as string) ?? "",
    intolerances: (doc.intolerances as string[]) ?? [],
    calorieRange: (doc.calorieRange as { min: number; max: number }) ?? { min: 0, max: 800 },
    proteinTarget: (doc.proteinTarget as number) ?? 0,
    carbRange: (doc.carbRange as { min: number; max: number }) ?? { min: 0, max: 999 },
    fatRange: (doc.fatRange as { min: number; max: number }) ?? { min: 0, max: 999 },
    sodiumRange: (doc.sodiumRange as { min: number; max: number }) ?? { min: 0, max: 9999 },
    sugarRange: (doc.sugarRange as { min: number; max: number }) ?? { min: 0, max: 999 },
    maxReadyTime: (doc.maxReadyTime as number) ?? 0,
    mealTypes: (doc.mealTypes as string[]) ?? [],
    equipment: (doc.equipment as string[]) ?? [],
    servingRange: (doc.servingRange as { min: number; max: number }) ?? { min: 0, max: 0 },
    query: (doc.query as string) ?? "",
    sortPreference: (doc.sortPreference as string) ?? "",
    sortDirection: (doc.sortDirection as "asc" | "desc") ?? "asc",
    takeoutDays: (doc.takeoutDays as string[]) ?? [],
    dailyCalorieTarget: (doc.dailyCalorieTarget as number) ?? 0,
    dailyProteinTarget: (doc.dailyProteinTarget as number) ?? 0,
    dailyCarbTarget: (doc.dailyCarbTarget as number) ?? 0,
    dailyFatTarget: (doc.dailyFatTarget as number) ?? 0,
  };
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [preferences, setPreferences] = useState<ExtractedConstraints | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [mouse, setMouse] = useState({ x: 50, y: 50 });
  const [scrollY, setScrollY] = useState(0);
  const [mobilePrefsOpen, setMobilePrefsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? "demo";

  const startFresh = async () => {
    await fetch(`/api/preferences?userId=${userId}`, { method: "DELETE" });
    setPreferences(null);
    setMessages([]);
    setIsComplete(false);
    setConversationStarted(false);
    setText("");
  };

  const runDemo = async () => {
    setPreferences(SAMPLE_PREFS);
    setConversationStarted(true);
    setMessages([
      { role: "assistant", content: "Here's a sample. Vegetarian, Mediterranean & Mexican, under 600 cal, high protein, 30 min cook time, takeout Fridays. What would you like to change?" },
    ]);
    try {
      await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "vegetarian, Mediterranean and Mexican cuisines, under 600 calories per meal, high protein, 30 minutes cook time, takeout on Fridays",
          userId,
          existingPreferences: null,
        }),
      });
      // Pre-generate meal plan so calendar has content when they click "My plan"
      await fetch("/api/meal-plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, numDays: 7, mealsPerDay: 3 }),
      });
    } catch {
      // Demo works locally even if save fails
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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

  useEffect(() => {
    fetch(`/api/preferences?userId=${userId}`)
      .then((r) => r.json())
      .then((d) => {
        const prefs = prefsToConstraints(d.preferences ?? null);
        setPreferences(prefs);
        const hasAny =
          prefs &&
          ((prefs.diet?.length ?? 0) > 0 ||
            (prefs.intolerances?.length ?? 0) > 0 ||
            (prefs.preferredCuisines?.length ?? 0) > 0 ||
            (prefs.takeoutDays?.length ?? 0) > 0 ||
            ((prefs.calorieRange?.max ?? 0) > 0 && (prefs.calorieRange?.max ?? 9999) < 9999) ||
            (prefs.maxReadyTime ?? 0) > 0 ||
            (prefs.proteinTarget ?? 0) > 0);
        if (hasAny) {
          setMessages([{ role: "assistant", content: GREETING_WITH_PREFS }]);
          setConversationStarted(true);
        }
        setInitialized(true);
      })
      .catch(() => setInitialized(true));
  }, [userId]);

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setText("");

    if (!conversationStarted) setConversationStarted(true);

    setMessages((m) => [...m, { role: "user", content: trimmed }]);

    const lastQuestion = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? null;

    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          userId,
          existingPreferences: preferences,
          lastQuestion,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      setPreferences(data.merged);

      if (data.nextQuestion) {
        setMessages((m) => [...m, { role: "assistant", content: data.nextQuestion }]);
        setIsComplete(false);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: "All set. Add your preferences to your plan." }]);
        setIsComplete(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(text);
  };

  const scrollProgress = mainRef.current
    ? Math.min(1, scrollY / (mainRef.current.scrollHeight - window.innerHeight) || 0)
    : 0;

  if (!initialized) {
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

  const showLanding = !conversationStarted && messages.length === 0;

  const bgStyle = showLanding
    ? `radial-gradient(ellipse ${120 + mouse.x * 0.5}% ${100 + mouse.y * 0.5}% at ${mouse.x}% ${mouse.y}%, rgba(220, 232, 242, 0.5), transparent 50%),
       radial-gradient(ellipse 80% 60% at ${100 - mouse.x * 0.3}% ${100 - mouse.y * 0.3}%, rgba(249, 232, 224, 0.5), transparent 40%),
       linear-gradient(135deg, #fdfbf8 0%, #f9f5f0 40%, #f5efe8 100%)`
    : `linear-gradient(180deg, #fdfbf8 ${scrollProgress * 15}%, #f9f5f0 ${25 + scrollProgress * 25}%, #f5efe8 100%)`;

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
            <form onSubmit={handleSubmit} className="w-full max-w-lg mb-4">
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
                  disabled={!text.trim() || loading}
                  className="px-6 py-3 rounded-full bg-rust-500/90 hover:bg-rust-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-base transition-all active:scale-[0.98] shrink-0 shadow-sm shadow-rust-500/20"
                >
                  Go
                </button>
              </div>
            </form>
            <button
              type="button"
              onClick={runDemo}
              className="text-base text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 underline underline-offset-2 transition-colors font-medium"
            >
              Try a sample
            </button>
            <div className="mt-6 flex gap-4 justify-center">
              {status !== "loading" && (
                session ? (
                  <SignOutButton className="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 bg-transparent border-none cursor-pointer font-normal">
                    Sign out ({session.user?.email})
                  </SignOutButton>
                ) : (
                  <>
                    <a href="/login" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Sign in</a>
                    <a href="/signup" className="text-sm font-medium text-rust-600 dark:text-rust-400 hover:underline">Sign up</a>
                  </>
                )
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
                  <span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm">→</span>
                  My plan
                </a>
                <button
                  type="button"
                  onClick={startFresh}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm text-stone-500 hover:text-stone-700 hover:bg-stone-100/80 dark:text-stone-400 dark:hover:text-stone-300 dark:hover:bg-stone-800/80 transition-all border border-transparent"
                >
                  <span className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-400 dark:text-stone-500 text-xs">↻</span>
                  Start fresh
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {preferences ? (
                <PreferencesDashboard
                  prefs={preferences}
                  onUpdate={async (updates) => {
                    try {
                      const res = await fetch(`/api/preferences?userId=${userId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(updates),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        const next = prefsToConstraints(data.preferences ?? null);
                        setPreferences(next);
                      } else {
                        setPreferences((p) => (p ? { ...p, ...updates } : null));
                      }
                    } catch {
                      setPreferences((p) => (p ? { ...p, ...updates } : null));
                    }
                  }}
                />
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
                <button type="button" onClick={startFresh} className="px-3 py-2 rounded-lg text-sm text-stone-500 hover:text-stone-700 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800 transition-colors">Start fresh</button>
                {status !== "loading" && !session && (
                  <a href="/login" className="px-3 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800">Sign in</a>
                )}
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
                      <span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm">→</span>
                      My plan
                    </a>
                    <button type="button" onClick={() => { startFresh(); setMobilePrefsOpen(false); }} className="flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm text-stone-500 hover:text-stone-700 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800 border border-transparent">
                      <span className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-400 dark:text-stone-500 text-xs">↻</span>
                      Start fresh
                    </button>
                  </div>
                  {preferences ? (
                    <PreferencesDashboard
                      prefs={preferences}
                      onUpdate={async (updates) => {
                        try {
                          const res = await fetch(`/api/preferences?userId=${userId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(updates),
                          });
                          if (res.ok) {
                            const data = await res.json();
                            const next = prefsToConstraints(data.preferences ?? null);
                            setPreferences(next);
                          } else {
                            setPreferences((p) => (p ? { ...p, ...updates } : null));
                          }
                        } catch {
                          setPreferences((p) => (p ? { ...p, ...updates } : null));
                        }
                      }}
                    />
                  ) : (
                    <p className="text-base text-stone-500 dark:text-stone-400 italic">Share in chat</p>
                  )}
                </div>
              </div>
            )}

            <main className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-5 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto overflow-x-hidden pt-12 pb-4 space-y-6">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-5 py-4 leading-relaxed ${
                        msg.role === "user"
                          ? "bg-rust-500/95 text-white shadow-lg shadow-rust-500/15 text-[17px] font-medium"
                          : "bg-white/95 dark:bg-stone-800/95 text-stone-800 dark:text-stone-200 shadow-sm border border-stone-200/60 dark:border-stone-700/50 text-[18px]"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl px-5 py-4 bg-white/95 dark:bg-stone-800/95 shadow-sm border border-stone-200/60 dark:border-stone-700/50">
                      <span className="flex gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 mb-2 px-1">{error}</p>
              )}

              {!isComplete ? (
                <form onSubmit={handleSubmit} className="shrink-0 pt-4 pb-6">
                  <div className="flex gap-3 rounded-2xl bg-white/95 dark:bg-stone-900/80 backdrop-blur-md py-3 pl-6 pr-3 shadow-[0_4px_24px_rgba(0,0,0,0.06)] focus-within:shadow-[0_4px_28px_rgba(0,0,0,0.08)] transition-shadow duration-200 border border-stone-200/60 dark:border-stone-700/50">
                    <input
                      type="text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Tell me more..."
                      disabled={loading}
                      className="flex-1 bg-transparent px-2 py-2 text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 text-base focus:outline-none disabled:opacity-60 min-w-0"
                    />
                    <button
                      type="submit"
                      disabled={!text.trim() || loading}
                      className="px-5 py-2.5 rounded-xl bg-rust-500/90 hover:bg-rust-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-base transition-all active:scale-[0.98] shrink-0 shadow-sm shadow-rust-500/20"
                    >
                      Send
                    </button>
                  </div>
                  <p className="text-sm text-stone-500 dark:text-stone-400 mt-3 text-center">
                    Say &quot;done&quot; or &quot;I&apos;m ready&quot; when you&apos;re finished
                  </p>
                </form>
              ) : (
                <div className="pt-4 pb-6">
                  <a
                    href="/meal-plan"
                    className="block w-full py-5 rounded-2xl bg-rust-500/90 hover:bg-rust-600 text-white font-medium text-lg text-center transition-all active:scale-[0.99] shadow-lg shadow-rust-500/15 hover:shadow-rust-500/25"
                  >
                    Add to my plan
                  </a>
                </div>
              )}
            </main>
          </div>
        </div>
      )}
    </div>
  );
}
