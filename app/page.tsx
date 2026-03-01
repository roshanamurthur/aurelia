"use client";

import Chat from "@/app/components/Chat";
import SignOutButton from "@/app/components/SignOutButton";
import { useConvexAuth, useQuery } from "convex/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "../convex/_generated/api";

const LANDING_PLACEHOLDER = "Calorie goals, cuisines, allergies, what you love...";

function Tag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 px-2 py-1 text-sm font-medium border border-black text-black">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 opacity-60 hover:opacity-100"
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
        <div className="border border-black p-3">
          <p className="text-xs font-semibold text-black mb-1.5">Diet</p>
          <div className="flex flex-wrap gap-1">
            {prefs.dietaryRestrictions.map((d: string) => <Tag key={d} label={d} />)}
          </div>
        </div>
      )}
      {(prefs.allergies?.length ?? 0) > 0 && (
        <div className="border border-black p-3">
          <p className="text-xs font-semibold text-black mb-1.5">Allergies</p>
          <div className="flex flex-wrap gap-1">
            {prefs.allergies.map((a: string) => <Tag key={a} label={a} />)}
          </div>
        </div>
      )}
      {(prefs.cuisinePreferences?.length ?? 0) > 0 && (
        <div className="border border-black p-3">
          <p className="text-xs font-semibold text-black mb-1.5">Cuisines</p>
          <div className="flex flex-wrap gap-1">
            {prefs.cuisinePreferences.map((c: string) => <Tag key={c} label={c} />)}
          </div>
        </div>
      )}
      {(prefs.calorieTarget ?? 0) > 0 && (
        <div className="border border-black p-3">
          <p className="text-xs font-semibold text-black mb-1.5">Calories</p>
          <span>{prefs.calorieTarget} cal/day</span>
        </div>
      )}
      {(prefs.proteinTargetGrams ?? 0) > 0 && (
        <div className="border border-black p-3">
          <p className="text-xs font-semibold text-black mb-1.5">Protein</p>
          <span>{prefs.proteinTargetGrams}g/day</span>
        </div>
      )}
      {(prefs.excludedIngredients?.length ?? 0) > 0 && (
        <div className="border border-black p-3">
          <p className="text-xs font-semibold text-black mb-1.5">Excluded</p>
          <div className="flex flex-wrap gap-1">
            {prefs.excludedIngredients.map((i: string) => <Tag key={i} label={i} />)}
          </div>
        </div>
      )}
      {(prefs.householdSize ?? 0) > 1 && (
        <div className="border border-black p-3">
          <p className="text-xs font-semibold text-black mb-1.5">Household</p>
          <span>{prefs.householdSize} people</span>
        </div>
      )}
      {(prefs.budgetPerWeek ?? 0) > 0 && (
        <div className="border border-black p-3">
          <p className="text-xs font-semibold text-black mb-1.5">Budget</p>
          <span>${prefs.budgetPerWeek}/week</span>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [conversationStarted, setConversationStarted] = useState(false);
  const [initialMessage, setInitialMessage] = useState<string | undefined>();
  const [text, setText] = useState("");
  const [mobilePrefsOpen, setMobilePrefsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const preferences = useQuery(api.preferences.get);

  const showLanding = !conversationStarted;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex gap-2">
          <span className="w-2 h-2 bg-black animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-black animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 bg-black animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

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
      className={`flex flex-col ${showLanding ? "min-h-screen" : "h-screen overflow-hidden"}`}
      style={{ background: "#ffffff" }}
    >
      {showLanding ? (
        <div className="flex-1 overflow-y-auto bg-white">
          {/* HERO — Screenshot centered, large */}
          <section className="min-h-screen flex flex-col items-center justify-center px-6 py-20">
            <div className="w-full max-w-2xl mx-auto">
              <Image
                src="/landing-hero.png"
                alt="Aurelia — Plan, Order, Cook, Eat"
                width={800}
                height={600}
                className="w-full h-auto object-contain"
                priority
              />
            </div>
            <div className="w-full max-w-md mt-12 flex flex-col items-center gap-4">
              <form onSubmit={handleLandingSubmit} className="w-full">
                <input
                  ref={inputRef}
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={LANDING_PLACEHOLDER}
                  autoFocus
                  className="w-full py-4 px-4 border-2 border-black bg-white text-black placeholder:text-black/60 text-base focus:outline-none"
                />
              </form>
              <Link
                href="/meal-plan"
                className="w-full py-4 px-6 border-2 border-black bg-white text-black font-semibold text-center hover:bg-black hover:text-white transition-colors"
              >
                View your meal plan
              </Link>
            </div>
          </section>
        </div>
      ) : (
        <div className="flex-1 flex h-screen overflow-hidden bg-white">
          <aside className="hidden lg:flex w-80 shrink-0 flex-col border-r border-black bg-white">
            <div className="p-6 border-b border-black">
              <Link href="/" className="flex items-center gap-2 mb-4">
                <img src="/aurelia-logo.png" alt="Aurelia" className="w-7 h-7 object-contain" />
                <span className="font-display text-lg font-semibold text-black">Aurelia</span>
              </Link>
              <h2 className="text-sm font-semibold text-black mb-4">Preferences</h2>
              <div className="flex flex-col gap-2">
                <Link
                  href="/meal-plan"
                  className="flex items-center gap-3 px-4 py-3 border border-black text-black font-semibold hover:bg-black hover:text-white transition-colors"
                >
                  My plan
                </Link>
                <SignOutButton className="flex items-center gap-3 px-4 py-3 border border-black text-black font-semibold hover:bg-black hover:text-white transition-colors bg-transparent cursor-pointer">
                  Sign out
                </SignOutButton>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {preferences ? (
                <PreferencesDashboard prefs={preferences} />
              ) : (
                <p className="text-base text-black/60 italic">Share your preferences in the chat</p>
              )}
            </div>
          </aside>

          <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-white">
            <header className="lg:hidden shrink-0 px-5 py-4 flex items-center justify-between border-b border-black bg-white">
              <button
                type="button"
                onClick={() => setMobilePrefsOpen(true)}
                className="text-base font-semibold text-black"
              >
                Preferences
              </button>
              <Link href="/meal-plan" className="px-4 py-2 border border-black text-black font-semibold text-sm">
                My plan
              </Link>
            </header>

            {mobilePrefsOpen && (
              <div className="lg:hidden fixed inset-0 z-40" onClick={() => setMobilePrefsOpen(false)}>
                <div className="absolute inset-y-0 left-0 w-80 bg-white border-r border-black p-6" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="font-display text-lg font-semibold text-black">Preferences</h2>
                    <button type="button" onClick={() => setMobilePrefsOpen(false)} className="w-10 h-10 border border-black flex items-center justify-center text-xl text-black">&times;</button>
                  </div>
                  <div className="flex flex-col gap-2 mb-6">
                    <Link href="/meal-plan" onClick={() => setMobilePrefsOpen(false)} className="flex items-center gap-3 px-4 py-3 border border-black text-black font-semibold">
                      My plan
                    </Link>
                  </div>
                  {preferences ? (
                    <PreferencesDashboard prefs={preferences} />
                  ) : (
                    <p className="text-base text-black/60 italic">Share in chat</p>
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
