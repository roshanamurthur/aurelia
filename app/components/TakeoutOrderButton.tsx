"use client";

import { useState } from "react";

const CHIPOTLE_BOWLS = [
  "Chipotle Chicken Bowl",
  "Chipotle Steak Bowl",
  "Chipotle Barbacoa Bowl",
  "Chipotle Carnitas Bowl",
  "Chipotle Sofritas Bowl",
  "Chipotle Veggie Bowl",
  "Chipotle Chicken Burrito Bowl",
  "Chipotle Steak Burrito Bowl",
  "Chipotle Barbacoa Burrito Bowl",
  "Chipotle Carnitas Burrito Bowl",
  "Chipotle Sofritas Burrito Bowl",
  "Chipotle Veggie Burrito Bowl",
  "Chipotle Chicken Salad Bowl",
  "Chipotle Steak Salad Bowl",
  "Chipotle Veggie Salad Bowl",
];

type OrderStatus = "idle" | "proposing" | "ordering" | "success" | "error";

function pickRandomBowl(exclude?: string | null): string {
  const options = exclude ? CHIPOTLE_BOWLS.filter((b) => b !== exclude) : CHIPOTLE_BOWLS;
  const list = options.length > 0 ? options : CHIPOTLE_BOWLS;
  return list[Math.floor(Math.random() * list.length)]!;
}

interface TakeoutOrderButtonProps {
  variant?: "card" | "button";
}

export default function TakeoutOrderButton({ variant = "button" }: TakeoutOrderButtonProps) {
  const [status, setStatus] = useState<OrderStatus>("idle");
  const [proposedItem, setProposedItem] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const proposeTakeout = () => {
    setProposedItem(pickRandomBowl());
    setStatus("proposing");
    setResult(null);
    setLiveUrl(null);
    setError(null);
  };

  const disapproveAndRegenerate = () => {
    setProposedItem((current) => pickRandomBowl(current));
  };

  const confirmAndOrder = async () => {
    if (!proposedItem) return;
    setStatus("ordering");
    setError(null);

    try {
      const res = await fetch("/api/doordash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchIntent: proposedItem }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Order failed");
      }

      setStatus("success");
      setResult(data.output || "Added to cart.");
      setLiveUrl(data.liveUrl || null);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  if (variant === "card") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        {status === "idle" && (
          <button
            type="button"
            onClick={proposeTakeout}
            className="px-3 py-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-600 text-white text-xs font-medium transition-all active:scale-[0.97] shadow-sm"
          >
            Order Takeout
          </button>
        )}
        {status === "proposing" && proposedItem && (
          <div className="text-center px-2 space-y-2">
            <p className="text-[10px] text-stone-500 dark:text-stone-400">We&apos;ll order:</p>
            <p className="text-xs font-medium text-stone-800 dark:text-stone-200 line-clamp-2">{proposedItem}</p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={confirmAndOrder}
                className="px-2.5 py-1 rounded-lg bg-green-500/90 hover:bg-green-600 text-white text-xs font-medium transition-all active:scale-[0.97]"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={disapproveAndRegenerate}
                className="px-2.5 py-1 rounded-lg bg-stone-300 dark:bg-stone-600 hover:bg-stone-400 dark:hover:bg-stone-500 text-stone-800 dark:text-stone-200 text-xs font-medium transition-all active:scale-[0.97]"
              >
                Different item
              </button>
            </div>
          </div>
        )}
        {status === "ordering" && (
          <div className="text-center px-2">
            <div className="flex gap-1 justify-center mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">{proposedItem}</p>
            <p className="text-[10px] text-stone-400 mt-0.5">Ordering via DoorDash...</p>
            {liveUrl && (
              <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline mt-0.5 block">
                Watch live
              </a>
            )}
          </div>
        )}
        {status === "success" && (
          <div className="text-center px-2">
            <p className="text-xs text-green-600 dark:text-green-400 font-medium">Added to cart</p>
            <p className="text-[10px] text-stone-500 mt-0.5 line-clamp-2">{proposedItem}</p>
            <button type="button" onClick={proposeTakeout} className="text-[10px] text-blue-500 hover:underline mt-1">
              Order another
            </button>
          </div>
        )}
        {status === "error" && (
          <div className="text-center px-2">
            <p className="text-xs text-red-500 font-medium">Failed</p>
            <p className="text-[10px] text-stone-400 mt-0.5 line-clamp-2">{error}</p>
            <button type="button" onClick={proposeTakeout} className="text-[10px] text-blue-500 hover:underline mt-1">
              Try again
            </button>
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
          onClick={proposeTakeout}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-amber-500/90 hover:bg-amber-600 text-white transition-all active:scale-[0.97] shadow-sm flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 8V5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3" />
            <path d="M21 12H7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1Z" />
            <path d="M10 16h6" />
          </svg>
          Order Takeout
        </button>
      )}
      {status === "proposing" && proposedItem && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-stone-50 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700">
          <span className="text-sm text-stone-600 dark:text-stone-300">Order:</span>
          <span className="text-sm font-medium text-stone-800 dark:text-stone-200 max-w-[180px] truncate" title={proposedItem}>
            {proposedItem}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={confirmAndOrder}
              className="px-2.5 py-1 rounded-lg bg-green-500/90 hover:bg-green-600 text-white text-xs font-medium"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={disapproveAndRegenerate}
              className="px-2.5 py-1 rounded-lg bg-stone-200 dark:bg-stone-600 hover:bg-stone-300 dark:hover:bg-stone-500 text-stone-700 dark:text-stone-300 text-xs font-medium"
            >
              Different
            </button>
          </div>
        </div>
      )}
      {status === "ordering" && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-sm text-amber-700 dark:text-amber-300 font-medium">{proposedItem}</span>
          {liveUrl && (
            <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline ml-1">
              Watch
            </a>
          )}
        </div>
      )}
      {status === "success" && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200/60 dark:border-green-800/40">
          <span className="text-sm text-green-600 dark:text-green-400 font-medium">{proposedItem} added to cart</span>
          <button type="button" onClick={proposeTakeout} className="text-xs text-blue-500 hover:underline">
            Again
          </button>
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40">
          <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
          <button type="button" onClick={proposeTakeout} className="text-xs text-blue-500 hover:underline">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
