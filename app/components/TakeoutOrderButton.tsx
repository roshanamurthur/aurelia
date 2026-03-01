"use client";

import { SF_MEALS_CALORIES } from "@/lib/sfMeals";
import { useState } from "react";

// Simple, searchable meals (matches data/sf-meals.csv)
const SF_MEALS = Object.keys(SF_MEALS_CALORIES);

type OrderStatus = "idle" | "proposing" | "ordering" | "success" | "error";

function pickRandomMeal(exclude?: string | null): string {
  const options = exclude ? SF_MEALS.filter((m) => m !== exclude) : SF_MEALS;
  const list = options.length > 0 ? options : SF_MEALS;
  return list[Math.floor(Math.random() * list.length)]!;
}

/** Deterministic meal for a slot — same slot always shows same suggested meal. */
function pickMealForSlot(slotKey: string): string {
  let hash = 0;
  for (let i = 0; i < slotKey.length; i++) {
    hash = (hash << 5) - hash + slotKey.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % SF_MEALS.length;
  return SF_MEALS[idx]!;
}

export type ScheduleStatus = {
  status: "ordering" | "success" | "error";
  progressMessage?: string;
  liveUrl?: string;
  scheduledFor?: string;
  error?: string;
};

interface TakeoutOrderButtonProps {
  variant?: "card" | "button";
  /** When provided, skip the random-proposal step and order this item directly */
  searchIntent?: string;
  /** e.g. "friday-dinner" — used as fallback when searchIntent is empty, so every slot shows a specific meal */
  slotKey?: string;
  /** Called when user selects a takeout meal (Different item or Order) — persists to plan so calories update */
  onMealChange?: (mealName: string) => void;
  /** When set (e.g. from Schedule All), show this status inline instead of idle — overrides internal state */
  scheduleStatus?: ScheduleStatus | null;
  /** Called when user clicks Retry on a schedule-status error — parent can clear the slot so user can retry */
  onClearScheduleError?: () => void;
}

export default function TakeoutOrderButton({ variant = "button", searchIntent, slotKey, onMealChange, scheduleStatus, onClearScheduleError }: TakeoutOrderButtonProps) {
  const baseMeal = searchIntent?.trim() || (slotKey ? pickMealForSlot(slotKey) : null);
  const [overrideMeal, setOverrideMeal] = useState<string | null>(null);
  const displayMeal = overrideMeal ?? baseMeal;
  const [status, setStatus] = useState<OrderStatus>("idle");
  const [proposedItem, setProposedItem] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string>("Searching for item...");

  const placeOrder = async (item: string) => {
    setProposedItem(item);
    setStatus("ordering");
    setError(null);
    setProgressMessage("Searching for item...");

    try {
      const res = await fetch("/api/doordash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchIntent: item, stream: true }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream")) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error("No response body");
        let buffer = "";
        let gotDone = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "step") {
                  const raw = (data.message || "").toLowerCase();
                  let friendly = data.message || "Working...";
                  if (raw.includes("search") || raw.includes("finding")) friendly = "Searching for item...";
                  else if (raw.includes("restaurant") || (raw.includes("click") && raw.includes("first"))) friendly = "Opening restaurant...";
                  else if (raw.includes("add") && (raw.includes("cart") || raw.includes("menu"))) friendly = "Adding to cart...";
                  else if (raw.length > 50) friendly = raw.slice(0, 47) + "...";
                  setProgressMessage(friendly);
                } else if (data.type === "done") {
                  setStatus("success");
                  setResult(data.output || "Added to cart.");
                  setLiveUrl(data.liveUrl || null);
                  gotDone = true;
                  return;
                } else if (data.type === "error") {
                  throw new Error(data.error || "Order failed");
                }
              } catch (e) {
                if (e instanceof SyntaxError) continue;
                throw e;
              }
            }
          }
        }
        if (!gotDone) throw new Error("Connection interrupted. Please check your order.");
      } else {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Order failed");
        }
        setStatus("success");
        setResult(data.output || "Added to cart.");
        setLiveUrl(data.liveUrl || null);
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const handleOrder = async () => {
    const mealToOrder = displayMeal ?? pickRandomMeal();
    if (!displayMeal) setOverrideMeal(mealToOrder);
    await onMealChange?.(mealToOrder);
    placeOrder(mealToOrder);
  };

  const handleDifferent = async () => {
    const newMeal = displayMeal ? pickRandomMeal(displayMeal) : pickRandomMeal();
    setOverrideMeal(newMeal);
    await onMealChange?.(newMeal);
  };

  const openApproveFlow = () => {
    if (!baseMeal) {
      setOverrideMeal(pickRandomMeal());
      if (variant === "button") setStatus("proposing");
    }
  };

  // Small DoorDash indicator — dot is red (idle), orange (ordering), green (success)
  const DoorDashBadge = ({ onDark = false, dotStatus }: { onDark?: boolean; dotStatus?: "idle" | "ordering" | "success" }) => {
    const dotColor =
      dotStatus === "ordering"
        ? "bg-amber-500"
        : dotStatus === "success"
          ? "bg-emerald-500"
          : "bg-[#FF3008]";
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-xs font-medium ${onDark ? "text-white/80" : "text-stone-400 dark:text-stone-500"}`}
        title="Orders via DoorDash"
      >
        <span className={`w-1 h-1 rounded-full ${dotColor}`} aria-hidden />
        DoorDash
      </span>
    );
  };

  // Shared card style — matches recipe cards: stone border, same padding
  const cardBase = "w-full text-left py-2 px-3 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800/80";

  // When scheduleStatus is set (from Schedule All), show that state inline — takes precedence over internal status
  const effectiveStatus = scheduleStatus
    ? (scheduleStatus.status === "ordering"
        ? "ordering"
        : scheduleStatus.status === "success"
          ? "success"
          : scheduleStatus.status === "error"
            ? "error"
            : "idle")
    : status;

  if (variant === "card") {
    return (
      <div className="w-full shrink-0">
        {effectiveStatus === "idle" && (
          displayMeal ? (
            <div className={`${cardBase} hover:border-rust-300 dark:hover:border-rust-700 transition-colors`}>
              <p className="text-sm font-medium text-stone-800 dark:text-stone-200 line-clamp-2 leading-tight">{displayMeal}</p>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleOrder}
                  className="text-xs font-medium text-rust-600 dark:text-rust-400 hover:text-rust-700 dark:hover:text-rust-300 hover:underline"
                >
                  Order
                </button>
                <DoorDashBadge />
                <span className="text-stone-300 dark:text-stone-600">·</span>
                <button
                  type="button"
                  onClick={handleDifferent}
                  className="text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 hover:underline"
                >
                  Different item
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={openApproveFlow}
              className="w-full py-2 rounded-xl bg-rust-500/90 hover:bg-rust-600 text-white text-sm font-medium transition-all active:scale-[0.97] shadow-sm flex items-center justify-center gap-1.5"
            >
              Order Takeout
              <DoorDashBadge onDark />
            </button>
          )
        )}
        {effectiveStatus === "ordering" && (
          <div className={cardBase}>
            <div className="flex items-center gap-2">
              <DoorDashBadge dotStatus="ordering" />
              <div className="flex gap-0.5 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
                  {scheduleStatus ? displayMeal : proposedItem}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {scheduleStatus?.progressMessage ?? (scheduleStatus ? "Ordering…" : progressMessage)}
                </p>
              </div>
              {(scheduleStatus?.liveUrl || (!scheduleStatus && liveUrl)) && (
                <a
                  href={scheduleStatus?.liveUrl ?? liveUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-rust-600 dark:text-rust-400 hover:underline shrink-0"
                >
                  Watch
                </a>
              )}
            </div>
          </div>
        )}
        {effectiveStatus === "success" && (
          <div className={cardBase}>
            <p className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
              {scheduleStatus ? displayMeal : proposedItem}
            </p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <DoorDashBadge dotStatus="success" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Added to cart
                {scheduleStatus?.scheduledFor && (
                  <span className="text-rust-600 dark:text-rust-400 ml-1">· ~{scheduleStatus.scheduledFor}</span>
                )}
              </span>
              {(scheduleStatus?.liveUrl || (!scheduleStatus && liveUrl)) && (
                <a
                  href={scheduleStatus?.liveUrl ?? liveUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-rust-600 dark:text-rust-400 hover:underline"
                >
                  Watch
                </a>
              )}
              {!scheduleStatus && (
                <button type="button" onClick={openApproveFlow} className="text-xs font-medium text-rust-600 dark:text-rust-400 hover:underline">
                  Order another
                </button>
              )}
            </div>
          </div>
        )}
        {effectiveStatus === "error" && (
          <div className={cardBase}>
            <p className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
              {scheduleStatus ? displayMeal : proposedItem}
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 line-clamp-2">
              {scheduleStatus?.error ?? error}
            </p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <button
                type="button"
                onClick={scheduleStatus ? (onClearScheduleError ?? openApproveFlow) : openApproveFlow}
                className="text-xs font-medium text-rust-600 dark:text-rust-400 hover:underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // variant === "button" — standalone button for the header
  return (
    <div className="relative inline-flex items-center">
      {status === "idle" && (
        <button
          type="button"
          onClick={openApproveFlow}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-rust-500/90 hover:bg-rust-600 text-white transition-all active:scale-[0.97] shadow-sm flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 8V5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3" />
            <path d="M21 12H7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1Z" />
            <path d="M10 16h6" />
          </svg>
          Order Takeout
        </button>
      )}
      {status === "proposing" && displayMeal && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-stone-50 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700">
          <span className="text-sm text-stone-600 dark:text-stone-400">Order:</span>
          <span className="text-sm font-medium text-stone-800 dark:text-stone-200 max-w-[180px] truncate" title={displayMeal}>
            {displayMeal}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleOrder}
              className="px-3 py-2 rounded-xl bg-rust-500/90 hover:bg-rust-600 text-white text-sm font-medium transition-all active:scale-[0.97] shadow-sm"
            >
              Order
            </button>
            <button
              type="button"
              onClick={handleDifferent}
              className="px-3 py-2 rounded-xl bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 border border-stone-200 dark:border-stone-600 text-stone-700 dark:text-stone-300 text-sm font-medium transition-all active:scale-[0.97]"
            >
              Different
            </button>
          </div>
        </div>
      )}
      {status === "ordering" && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-stone-50 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-rust-600 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <div>
            <p className="text-sm font-medium text-stone-800 dark:text-stone-200">{proposedItem}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400">{progressMessage}</p>
          </div>
          {liveUrl && (
            <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-rust-600 dark:text-rust-400 hover:underline ml-1">
              Watch
            </a>
          )}
        </div>
      )}
      {status === "success" && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-stone-50 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700">
          <span className="text-sm font-medium text-stone-800 dark:text-stone-200">{proposedItem} added to cart</span>
          <button type="button" onClick={openApproveFlow} className="text-xs font-medium text-rust-600 dark:text-rust-400 hover:underline">
            Again
          </button>
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-stone-50 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700">
          <span className="text-sm text-stone-700 dark:text-stone-300">{error}</span>
          <button type="button" onClick={openApproveFlow} className="text-xs font-medium text-rust-600 dark:text-rust-400 hover:underline">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
