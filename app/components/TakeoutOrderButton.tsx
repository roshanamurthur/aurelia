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

  const DoorDashIcon = ({ onDark = false, status }: { onDark?: boolean; status?: "idle" | "ordering" | "success" }) => {
    const color =
      status === "ordering"
        ? "text-black"
        : status === "success"
          ? "text-black"
          : onDark
            ? "text-white"
            : "text-black";
    return (
      <span className={`inline-flex items-center ${color}`} title="Orders via DoorDash">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 8V5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3" />
          <path d="M21 12H7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1Z" />
          <path d="M10 16h6" />
        </svg>
      </span>
    );
  };

  const cardBase = "w-full text-left py-2 px-3 border-l-4 border-l-rust-500 bg-white";

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
            <div className={`${cardBase} hover:bg-black/5 transition-colors`}>
              <p className="text-sm font-medium text-black line-clamp-2 leading-tight">{displayMeal}</p>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleOrder}
                  className="text-xs font-medium text-black hover:underline"
                >
                  Order
                </button>
                <DoorDashIcon />
                <span className="text-black/50">·</span>
                <button
                  type="button"
                  onClick={handleDifferent}
                  className="text-xs font-medium text-black/70 hover:text-black hover:underline"
                >
                  Different item
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={openApproveFlow}
              className="w-full py-2 border border-black bg-black hover:bg-white hover:text-black text-white text-sm font-medium transition-all active:scale-[0.97] flex items-center justify-center gap-1.5"
            >
              Order Takeout
              <DoorDashIcon onDark />
            </button>
          )
        )}
        {effectiveStatus === "ordering" && (
          <div className={cardBase}>
            <div className="flex items-center gap-2">
              <DoorDashIcon status="ordering" />
              <div className="flex gap-0.5 shrink-0">
                <span className="w-1.5 h-1.5 bg-black animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-black animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-black animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-black truncate">
                  {scheduleStatus ? displayMeal : proposedItem}
                </p>
                <p className="text-xs text-black/70">
                  {scheduleStatus?.progressMessage ?? (scheduleStatus ? "Ordering…" : progressMessage)}
                </p>
              </div>
              {(scheduleStatus?.liveUrl || (!scheduleStatus && liveUrl)) && (
                <a
                  href={scheduleStatus?.liveUrl ?? liveUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-black hover:underline shrink-0"
                >
                  Watch
                </a>
              )}
            </div>
          </div>
        )}
        {effectiveStatus === "success" && (
          <div className={cardBase}>
            <p className="text-sm font-medium text-black truncate">
              {scheduleStatus ? displayMeal : proposedItem}
            </p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <DoorDashIcon status="success" />
              <span className="text-xs font-medium text-black">
                Added to cart
                {scheduleStatus?.scheduledFor && (
                  <span className="text-black/70 ml-1">· ~{scheduleStatus.scheduledFor}</span>
                )}
              </span>
              {(scheduleStatus?.liveUrl || (!scheduleStatus && liveUrl)) && (
                <a
                  href={scheduleStatus?.liveUrl ?? liveUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-black hover:underline"
                >
                  Watch
                </a>
              )}
              {!scheduleStatus && (
                <button type="button" onClick={openApproveFlow} className="text-xs font-medium text-black hover:underline">
                  Order another
                </button>
              )}
            </div>
          </div>
        )}
        {effectiveStatus === "error" && (
          <div className={cardBase}>
            <p className="text-sm font-medium text-black truncate">
              {scheduleStatus ? displayMeal : proposedItem}
            </p>
            <p className="text-xs text-black/70 mt-0.5 line-clamp-2">
              {scheduleStatus?.error ?? error}
            </p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <button
                type="button"
                onClick={scheduleStatus ? (onClearScheduleError ?? openApproveFlow) : openApproveFlow}
                className="text-xs font-medium text-black hover:underline"
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
          className="px-4 py-2 border border-black text-sm font-medium bg-black hover:bg-white hover:text-black text-white transition-all active:scale-[0.97] flex items-center gap-2"
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
        <div className="flex items-center gap-3 px-4 py-2 border border-black bg-white">
          <span className="text-sm text-black/70">Order:</span>
          <span className="text-sm font-medium text-black max-w-[180px] truncate" title={displayMeal}>
            {displayMeal}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleOrder}
              className="px-3 py-2 border border-black bg-black hover:bg-white hover:text-black text-white text-sm font-medium transition-all active:scale-[0.97]"
            >
              Order
            </button>
            <button
              type="button"
              onClick={handleDifferent}
              className="px-3 py-2 border border-black bg-white hover:bg-black hover:text-white text-black text-sm font-medium transition-all active:scale-[0.97]"
            >
              Different
            </button>
          </div>
        </div>
      )}
      {status === "ordering" && (
        <div className="flex items-center gap-3 px-4 py-2 border border-black bg-white">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-black animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 bg-black animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 bg-black animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <div>
            <p className="text-sm font-medium text-black">{proposedItem}</p>
            <p className="text-xs text-black/70">{progressMessage}</p>
          </div>
          {liveUrl && (
            <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-black hover:underline ml-1">
              Watch
            </a>
          )}
        </div>
      )}
      {status === "success" && (
        <div className="flex items-center gap-3 px-4 py-2 border border-black bg-white">
          <span className="text-sm font-medium text-black">{proposedItem} added to cart</span>
          <button type="button" onClick={openApproveFlow} className="text-xs font-medium text-black hover:underline">
            Again
          </button>
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center gap-3 px-4 py-2 border border-black bg-white">
          <span className="text-sm text-black">{error}</span>
          <button type="button" onClick={openApproveFlow} className="text-xs font-medium text-black hover:underline">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
