"use client";

import type { ExtractedConstraints } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AgentChatPanelProps {
  userId: string;
  onClose: () => void;
}

function prefsToConstraints(doc: Record<string, unknown> | null): ExtractedConstraints | null {
  if (!doc) return null;
  return {
    excludeIngredients: (doc.excludeIngredients as string[]) ?? [],
    includeIngredients: (doc.includeIngredients as string[]) ?? [],
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

export default function AgentChatPanel({ userId, onClose }: AgentChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [preferences, setPreferences] = useState<ExtractedConstraints | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    fetch(`/api/preferences?userId=${userId}`)
      .then((r) => r.json())
      .then((d) => {
        const prefs = prefsToConstraints(d.preferences ?? null);
        setPreferences(prefs);
        if (prefs && (prefs.diet || prefs.intolerances?.length || prefs.preferredCuisines?.length)) {
          setMessages([{ role: "assistant", content: "What would you like to change about your meals or preferences?" }]);
        } else {
          setMessages([{ role: "assistant", content: "Tell me what you'd like—diet, cuisines, calorie goals, ingredients to avoid, or anything else." }]);
        }
        setInitialized(true);
      })
      .catch(() => {
        setMessages([{ role: "assistant", content: "Tell me what you'd like to change about your plan." }]);
        setInitialized(true);
      });
  }, [userId]);

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setText("");
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
      } else {
        setMessages((m) => [...m, { role: "assistant", content: "Got it. Regenerate your plan to apply these changes." }]);
      }
      router.refresh();
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

  if (!initialized) {
    return (
      <div className="w-96 shrink-0 border-l border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center p-8">
        <div className="flex gap-2">
          <span className="w-2 h-2 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-[420px] shrink-0 border-l border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex flex-col shadow-xl self-stretch min-h-0">
      <div className="p-5 border-b border-stone-200 dark:border-stone-700 flex items-center justify-between shrink-0">
        <h3 className="font-display text-xl font-semibold text-stone-900 dark:text-stone-100">Adjust your plan</h3>
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 flex items-center justify-center text-stone-600 dark:text-stone-400 text-lg"
        >
          &times;
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${msg.role === "user" ? "text-right" : "text-left"}`}
          >
            <div
              className={`inline-block max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-rust-500/90 text-white"
                  : "bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-left">
            <div className="inline-block rounded-2xl px-4 py-2.5 bg-stone-100 dark:bg-stone-800 text-stone-500 text-sm">
              ...
            </div>
          </div>
        )}
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="p-4 border-t border-stone-200 dark:border-stone-700 shrink-0 bg-white dark:bg-stone-900">
        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. more protein, no dairy..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-rust-400/40"
          />
          <button
            type="submit"
            disabled={!text.trim() || loading}
            className="px-4 py-2.5 rounded-xl bg-rust-500/90 hover:bg-rust-600 disabled:opacity-50 text-white text-sm font-medium"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
