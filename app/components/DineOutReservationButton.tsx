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

  const OpenTableIcon = ({ onDark = false, status }: { onDark?: boolean; status?: "idle" | "ordering" | "success" }) => {
    const color =
      status === "ordering"
        ? "text-black"
        : status === "success"
          ? "text-black"
          : onDark
            ? "text-white"
            : "text-black";
    return (
      <span className={`inline-flex items-center ${color}`} title="Reservations via OpenTable">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 2v2" />
          <path d="M7 2v20" />
          <path d="M17 22h-4" />
          <path d="M17 22l-1-8a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1l-1 8" />
          <path d="M12 2v2" />
          <path d="M8 14V2" />
          <path d="M20 22V2" />
        </svg>
      </span>
    );
  };

  const cardBase = "w-full text-left py-2 px-3 border-l-4 border-l-rust-500 bg-white";

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
            <div className={`${cardBase} hover:bg-black/5 transition-colors`}>
              <p className="text-sm font-medium text-black line-clamp-2 leading-tight">{displayRestaurant}</p>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleMakeReservation}
                  className="text-xs font-medium text-black hover:underline"
                >
                  Make reservation
                </button>
                <OpenTableIcon />
                <span className="text-black/50">·</span>
                <button
                  type="button"
                  onClick={handleDifferent}
                  className="text-xs font-medium text-black/70 hover:text-black hover:underline"
                >
                  Different restaurant
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={openApproveFlow}
              className="w-full py-2 border border-black bg-black hover:bg-white hover:text-black text-white text-sm font-medium transition-all active:scale-[0.97] flex items-center justify-center gap-1.5"
            >
              Dine out
              <OpenTableIcon onDark />
            </button>
          ))}
        {effectiveStatus === "ordering" && (
          <div className={cardBase}>
            <div className="flex items-center gap-2">
              <OpenTableIcon status="ordering" />
              <div className="flex gap-0.5 shrink-0">
                <span className="w-1.5 h-1.5 bg-black animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-black animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-black animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-black truncate">
                  {scheduleStatus ? displayRestaurant : proposedRestaurant}
                </p>
                <p className="text-xs text-black/70">
                  {scheduleStatus?.progressMessage ?? (scheduleStatus ? "Making reservation…" : progressMessage)}
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
              {scheduleStatus ? displayRestaurant : proposedRestaurant}
            </p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <OpenTableIcon status="success" />
              <span className="text-xs font-medium text-black">
                Reservation confirmed
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
                  Book another
                </button>
              )}
            </div>
          </div>
        )}
        {effectiveStatus === "error" && (
          <div className={cardBase}>
            <p className="text-sm font-medium text-black truncate">
              {scheduleStatus ? displayRestaurant : proposedRestaurant}
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

  return (
    <div className="relative inline-flex items-center">
      {status === "idle" && (
        <button
          type="button"
          onClick={openApproveFlow}
          className="px-4 py-2 border border-black text-sm font-medium bg-black hover:bg-white hover:text-black text-white transition-all active:scale-[0.97] flex items-center gap-2"
        >
          Dine out
          <OpenTableIcon onDark />
        </button>
      )}
      {status === "proposing" && displayRestaurant && (
        <div className="flex items-center gap-3 px-4 py-2 border border-black bg-white">
          <span className="text-sm text-black/70">Reserve:</span>
          <span className="text-sm font-medium text-black max-w-[180px] truncate" title={displayRestaurant}>
            {displayRestaurant}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleMakeReservation}
              className="px-3 py-2 border border-black bg-black hover:bg-white hover:text-black text-white text-sm font-medium transition-all active:scale-[0.97]"
            >
              Make reservation
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
            <p className="text-sm font-medium text-black">{proposedRestaurant}</p>
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
          <span className="text-sm font-medium text-black">{proposedRestaurant} — reservation confirmed</span>
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
