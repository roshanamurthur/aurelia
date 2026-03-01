"use client";

import { getDefaultTimeForRestaurant, SF_RESTAURANTS } from "@/lib/sfRestaurants";
import { useState } from "react";

const SF_RESTAURANT_NAMES = SF_RESTAURANTS.map((r) => r.name);

type ReservationStatus = "idle" | "proposing" | "ordering" | "success" | "error";

function pickRandomRestaurant(exclude?: string | null): string {
  const options = exclude ? SF_RESTAURANT_NAMES.filter((r) => r !== exclude) : SF_RESTAURANT_NAMES;
  const list = options.length > 0 ? options : SF_RESTAURANT_NAMES;
  return list[Math.floor(Math.random() * list.length)]!;
}

/** Deterministic restaurant for a slot — same slot always shows same suggested restaurant. */
function pickRestaurantForSlot(slotKey: string): string {
  let hash = 0;
  for (let i = 0; i < slotKey.length; i++) {
    hash = (hash << 5) - hash + slotKey.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % SF_RESTAURANT_NAMES.length;
  return SF_RESTAURANT_NAMES[idx]!;
}

export type ScheduleStatus = {
  status: "ordering" | "success" | "error";
  progressMessage?: string;
  liveUrl?: string;
  scheduledFor?: string;
  error?: string;
};

interface DineOutReservationButtonProps {
  variant?: "card" | "button";
  restaurantName?: string;
  slotKey?: string;
  dateStr: string;
  defaultTime?: string;
  onMealChange?: (restaurantName: string) => void;
  scheduleStatus?: ScheduleStatus | null;
  onClearScheduleError?: () => void;
}

export default function DineOutReservationButton({
  variant = "card",
  restaurantName,
  slotKey,
  dateStr,
  defaultTime,
  onMealChange,
  scheduleStatus,
  onClearScheduleError,
}: DineOutReservationButtonProps) {
  const baseRestaurant = restaurantName?.trim() || (slotKey ? pickRestaurantForSlot(slotKey) : null);
  const [overrideRestaurant, setOverrideRestaurant] = useState<string | null>(null);
  const displayRestaurant = overrideRestaurant ?? baseRestaurant;
  const [status, setStatus] = useState<ReservationStatus>("idle");
  const [proposedRestaurant, setProposedRestaurant] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string>("Finding restaurant...");

  const makeReservation = async (restaurant: string) => {
    setProposedRestaurant(restaurant);
    setStatus("ordering");
    setError(null);
    setProgressMessage("Finding restaurant...");

    const time = defaultTime ?? getDefaultTimeForRestaurant(restaurant);

    try {
      const res = await fetch("/api/opentable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantName: restaurant,
          location: "San Francisco",
          date: dateStr,
          time,
          partySize: 2,
          stream: true,
        }),
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
                  if (raw.includes("search") || raw.includes("finding")) friendly = "Finding restaurant...";
                  else if (raw.includes("reservation") || raw.includes("booking")) friendly = "Making reservation...";
                  else if (raw.includes("availability") || raw.includes("time")) friendly = "Checking availability...";
                  else if (raw.length > 50) friendly = raw.slice(0, 47) + "...";
                  setProgressMessage(friendly);
                } else if (data.type === "done") {
                  setStatus("success");
                  setLiveUrl(data.liveUrl || null);
                  gotDone = true;
                  return;
                } else if (data.type === "error") {
                  setStatus("error");
                  setError(data.error || data.output || "Reservation failed");
                  gotDone = true;
                  return;
                }
              } catch (e) {
                if (e instanceof SyntaxError) continue;
                throw e;
              }
            }
          }
        }
        if (!gotDone) throw new Error("Connection interrupted. Please try again.");
      } else {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || data.details || "Reservation failed");
        }
        if (data.success === false || data.error) {
          setStatus("error");
          setError(data.error || data.output || "Reservation failed");
        } else {
          setStatus("success");
          setLiveUrl(data.liveUrl || null);
        }
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const handleMakeReservation = async () => {
    const restaurant = displayRestaurant ?? pickRandomRestaurant();
    if (!displayRestaurant) setOverrideRestaurant(restaurant);
    await onMealChange?.(restaurant);
    makeReservation(restaurant);
  };

  const handleDifferent = async () => {
    const newRestaurant = displayRestaurant ? pickRandomRestaurant(displayRestaurant) : pickRandomRestaurant();
    setOverrideRestaurant(newRestaurant);
    await onMealChange?.(newRestaurant);
  };

  const openApproveFlow = () => {
    if (!baseRestaurant) {
      setOverrideRestaurant(pickRandomRestaurant());
      if (variant === "button") setStatus("proposing");
    }
  };

  const OpenTableBadge = ({ onDark = false, dotStatus }: { onDark?: boolean; dotStatus?: "idle" | "ordering" | "success" }) => {
    const dotColor =
      dotStatus === "ordering"
        ? "bg-amber-500"
        : dotStatus === "success"
          ? "bg-emerald-500"
          : "bg-[#DA3743]";
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-xs font-medium ${onDark ? "text-white/80" : "text-stone-400 dark:text-stone-500"}`}
        title="Reservations via OpenTable"
      >
        <span className={`w-1 h-1 rounded-full ${dotColor}`} aria-hidden />
        OpenTable
      </span>
    );
  };

  const cardBase = "w-full text-left py-2 px-3 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800/80";

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
        {effectiveStatus === "idle" &&
          (displayRestaurant ? (
            <div className={`${cardBase} hover:border-rust-300 dark:hover:border-rust-700 transition-colors`}>
              <p className="text-sm font-medium text-stone-800 dark:text-stone-200 line-clamp-2 leading-tight">{displayRestaurant}</p>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleMakeReservation}
                  className="text-xs font-medium text-rust-600 dark:text-rust-400 hover:text-rust-700 dark:hover:text-rust-300 hover:underline"
                >
                  Make reservation
                </button>
                <OpenTableBadge />
                <span className="text-stone-300 dark:text-stone-600">·</span>
                <button
                  type="button"
                  onClick={handleDifferent}
                  className="text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 hover:underline"
                >
                  Different restaurant
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={openApproveFlow}
              className="w-full py-2 rounded-xl bg-rust-500/90 hover:bg-rust-600 text-white text-sm font-medium transition-all active:scale-[0.97] shadow-sm flex items-center justify-center gap-1.5"
            >
              Dine out
              <OpenTableBadge onDark />
            </button>
          ))}
        {effectiveStatus === "ordering" && (
          <div className={cardBase}>
            <div className="flex items-center gap-2">
              <OpenTableBadge dotStatus="ordering" />
              <div className="flex gap-0.5 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
                  {scheduleStatus ? displayRestaurant : proposedRestaurant}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {scheduleStatus?.progressMessage ?? (scheduleStatus ? "Making reservation…" : progressMessage)}
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
              {scheduleStatus ? displayRestaurant : proposedRestaurant}
            </p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <OpenTableBadge dotStatus="success" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Reservation confirmed
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
                  Book another
                </button>
              )}
            </div>
          </div>
        )}
        {effectiveStatus === "error" && (
          <div className={cardBase}>
            <p className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
              {scheduleStatus ? displayRestaurant : proposedRestaurant}
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

  return (
    <div className="relative inline-flex items-center">
      {status === "idle" && (
        <button
          type="button"
          onClick={openApproveFlow}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-rust-500/90 hover:bg-rust-600 text-white transition-all active:scale-[0.97] shadow-sm flex items-center gap-2"
        >
          Dine out
          <OpenTableBadge onDark />
        </button>
      )}
      {status === "proposing" && displayRestaurant && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-stone-50 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-700">
          <span className="text-sm text-stone-600 dark:text-stone-400">Reserve:</span>
          <span className="text-sm font-medium text-stone-800 dark:text-stone-200 max-w-[180px] truncate" title={displayRestaurant}>
            {displayRestaurant}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleMakeReservation}
              className="px-3 py-2 rounded-xl bg-rust-500/90 hover:bg-rust-600 text-white text-sm font-medium transition-all active:scale-[0.97] shadow-sm"
            >
              Make reservation
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
            <p className="text-sm font-medium text-stone-800 dark:text-stone-200">{proposedRestaurant}</p>
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
          <span className="text-sm font-medium text-stone-800 dark:text-stone-200">{proposedRestaurant} — reservation confirmed</span>
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
