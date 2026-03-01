"use client";

import { useState } from "react";

// Meals from SF restaurants near YC headquarters (matches data/sf-meals.csv)
const SF_MEALS = [
  "Chipotle Chicken Bowl",
  "Chipotle Steak Bowl",
  "Chipotle Barbacoa Bowl",
  "Chipotle Sofritas Bowl",
  "Chipotle Veggie Bowl",
  "Sweetgreen Guacamole Greens",
  "Sweetgreen Harvest Bowl",
  "Sweetgreen Kale Caesar",
  "Souvla Chicken Gyro",
  "Souvla Lamb Gyro",
  "Souvla Greek Salad",
  "Mendocino Farms Mendo Salad",
  "Mendocino Farms Not So Fried Chicken Sandwich",
  "Mendocino Farms Peruvian Steak Sandwich",
  "Panera Broccoli Cheddar Soup",
  "Panera Fuji Apple Salad",
  "Panera Chipotle Chicken Avocado Melt",
  "Panda Express Orange Chicken Bowl",
  "Panda Express Kung Pao Chicken Bowl",
  "Panda Express Beijing Beef Bowl",
  "Blaze Pizza Build Your Own Pizza",
  "Blaze Pizza Veggie Pizza",
  "Shake Shack ShackBurger",
  "Shake Shack Chicken Shack",
  "Shake Shack Crinkle Cut Fries",
  "Ike's Love and Sandwiches Dutch Crunch Club",
  "Ike's Love and Sandwiches Menage a Trois",
  "The Grove Caesar Salad",
  "The Grove Turkey Club",
  "Gordo Taqueria Super Steak Burrito",
  "Gordo Taqueria Super Chicken Burrito",
  "Gordo Taqueria Veggie Burrito",
  "Mission Chinese Thrice Cooked Bacon Rice Cakes",
  "Mission Chinese Mapo Tofu",
  "Mission Chinese Salt Cod Fried Rice",
  "SoMa Pizza Margherita Pizza",
  "SoMa Pizza Pepperoni Pizza",
  "Sushi Bistro Salmon Roll",
  "Sushi Bistro Spicy Tuna Roll",
  "Dumpling Home Xiao Long Bao",
  "Dumpling Home Pan Fried Pork Dumplings",
];

type OrderStatus = "idle" | "proposing" | "ordering" | "success" | "error";

function pickRandomMeal(exclude?: string | null): string {
  const options = exclude ? SF_MEALS.filter((m) => m !== exclude) : SF_MEALS;
  const list = options.length > 0 ? options : SF_MEALS;
  return list[Math.floor(Math.random() * list.length)]!;
}

interface TakeoutOrderButtonProps {
  variant?: "card" | "button";
  /** When provided, skip the random-proposal step and order this item directly */
  searchIntent?: string;
}

export default function TakeoutOrderButton({ variant = "button", searchIntent }: TakeoutOrderButtonProps) {
  const [status, setStatus] = useState<OrderStatus>("idle");
  const [proposedItem, setProposedItem] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const placeOrder = async (item: string) => {
    setProposedItem(item);
    setStatus("ordering");
    setError(null);

    try {
      const res = await fetch("/api/doordash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchIntent: item }),
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

  const proposeTakeout = () => {
    if (searchIntent) {
      placeOrder(searchIntent);
      return;
    }
    setProposedItem(pickRandomMeal());
    setStatus("proposing");
    setResult(null);
    setLiveUrl(null);
    setError(null);
  };

  const disapproveAndRegenerate = () => {
    setProposedItem((current) => pickRandomMeal(current));
  };

  const confirmAndOrder = async () => {
    if (!proposedItem) return;
    placeOrder(proposedItem);
  };

  if (variant === "card") {
    return (
      <div className="flex-1 flex flex-col w-full gap-2">
        {status === "idle" && (
          <button
            type="button"
            onClick={proposeTakeout}
            className="w-full py-2 rounded-xl bg-rust-500/90 hover:bg-rust-600 text-white text-sm font-medium transition-all active:scale-[0.97] shadow-sm"
          >
            Order Takeout
          </button>
        )}
        {status === "proposing" && proposedItem && (
          <div className="w-full space-y-2">
            <p className="text-xs text-stone-500 dark:text-stone-400">We&apos;ll order:</p>
            <p className="text-sm font-medium text-stone-800 dark:text-stone-200 line-clamp-2">{proposedItem}</p>
            <div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={confirmAndOrder}
                className="flex-1 py-2 rounded-xl bg-rust-500/90 hover:bg-rust-600 text-white text-sm font-medium transition-all active:scale-[0.97] shadow-sm"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={disapproveAndRegenerate}
                className="flex-1 py-2 rounded-xl bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 border border-stone-200 dark:border-stone-600 text-stone-700 dark:text-stone-300 text-sm font-medium transition-all active:scale-[0.97]"
              >
                Different item
              </button>
            </div>
          </div>
        )}
        {status === "ordering" && (
          <div className="text-center px-2">
            <div className="flex gap-1 justify-center mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-rust-600 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <p className="text-sm text-stone-800 dark:text-stone-200 font-medium">{proposedItem}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Ordering via DoorDash...</p>
            {liveUrl && (
              <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-0.5 block">
                Watch live
              </a>
            )}
          </div>
        )}
        {status === "success" && (
          <div className="w-full text-center">
            <p className="text-sm text-rust-600 dark:text-rust-400 font-medium">Added to cart</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 line-clamp-2">{proposedItem}</p>
            <button type="button" onClick={proposeTakeout} className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1">
              Order another
            </button>
          </div>
        )}
        {status === "error" && (
          <div className="w-full text-center">
            <p className="text-sm text-stone-700 dark:text-stone-300 font-medium">Failed</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 line-clamp-2">{error}</p>
            <button type="button" onClick={proposeTakeout} className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1">
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
      {status === "proposing" && proposedItem && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-stone-50 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700">
          <span className="text-sm text-stone-600 dark:text-stone-400">Order:</span>
          <span className="text-sm font-medium text-stone-800 dark:text-stone-200 max-w-[180px] truncate" title={proposedItem}>
            {proposedItem}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmAndOrder}
              className="px-3 py-2 rounded-xl bg-rust-500/90 hover:bg-rust-600 text-white text-sm font-medium transition-all active:scale-[0.97] shadow-sm"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={disapproveAndRegenerate}
              className="px-3 py-2 rounded-xl bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 border border-stone-200 dark:border-stone-600 text-stone-700 dark:text-stone-300 text-sm font-medium transition-all active:scale-[0.97]"
            >
              Different
            </button>
          </div>
        </div>
      )}
      {status === "ordering" && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-rust-50/80 dark:bg-rust-950/20 border border-rust-200/60 dark:border-rust-800/40">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-rust-600 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-rust-500 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-sm text-stone-800 dark:text-stone-200 font-medium">{proposedItem}</span>
          {liveUrl && (
            <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-1">
              Watch
            </a>
          )}
        </div>
      )}
      {status === "success" && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-rust-50/80 dark:bg-rust-950/20 border border-rust-200/60 dark:border-rust-800/40">
          <span className="text-sm text-rust-600 dark:text-rust-400 font-medium">{proposedItem} added to cart</span>
          <button type="button" onClick={proposeTakeout} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
            Again
          </button>
        </div>
      )}
      {status === "error" && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-stone-50 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700">
          <span className="text-sm text-stone-700 dark:text-stone-300">{error}</span>
          <button type="button" onClick={proposeTakeout} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
