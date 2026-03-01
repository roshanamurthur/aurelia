"use client";

import { useState } from "react";

interface TakeoutCardProps {
  dayName: string;
}

export default function TakeoutCard({ dayName }: TakeoutCardProps) {
  const capitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<object | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [twoFACode, setTwoFACode] = useState("");

  const handleOrder = async (forceCredentials = false) => {
    setLoading(true);
    setResult(null);
    setError(null);
    setDebug(null);
    setLiveUrl(null);
    setNeeds2FA(false);
    setSessionId(null);
    setTwoFACode("");
    try {
      const res = await fetch("/api/doordash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchIntent: "healthy dinner", forceCredentials }),
      });
      const data = await res.json();
      setLiveUrl(data.liveUrl ?? null);
      if (!res.ok) {
        setDebug(data.debug ?? null);
        throw new Error(data.details ?? data.error ?? "Request failed");
      }
      if (data.needs2FA && data.sessionId) {
        setNeeds2FA(true);
        setSessionId(data.sessionId);
      } else {
        setResult(data.output ?? "Order flow started.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit2FA = async () => {
    if (!sessionId || !twoFACode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/doordash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchIntent: "healthy dinner",
          phase: "2fa",
          code: twoFACode.trim(),
          sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details ?? data.error ?? "Request failed");
      setResult(data.output ?? "Order flow started.");
      setNeeds2FA(false);
      setSessionId(null);
      setTwoFACode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-rust-50 dark:bg-rust-900/20 border border-rust-200 dark:border-rust-800 rounded-lg p-2 text-center flex flex-col gap-1">
      <span className="text-lg" aria-hidden="true">&#127829;</span>
      <p className="text-xs font-medium text-rust-700 dark:text-rust-400">Takeout</p>
      <p className="text-xs text-rust-600 dark:text-rust-500">{capitalized}</p>
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => handleOrder(false)}
          disabled={loading}
          className="mt-1 px-2 py-1.5 text-xs font-medium rounded bg-rust-500 text-white hover:bg-rust-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Agent running…" : "Order on DoorDash"}
        </button>
        <button
          type="button"
          onClick={() => handleOrder(true)}
          disabled={loading}
          className="text-[10px] text-stone-500 hover:text-rust-600"
        >
          Try with login (if profile fails)
        </button>
      </div>
      {needs2FA && (
        <div className="mt-2 p-2 bg-stone-100 dark:bg-stone-800 rounded space-y-1.5">
          <p className="text-xs text-stone-600 dark:text-stone-400">
            Check your email for the 6-digit code from DoorDash.
          </p>
          <div className="flex gap-1">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={twoFACode}
              onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, ""))}
              className="flex-1 px-2 py-1 text-xs rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900"
            />
            <button
              type="button"
              onClick={handleSubmit2FA}
              disabled={loading || twoFACode.length < 6}
              className="px-2 py-1 text-xs font-medium rounded bg-rust-500 text-white hover:bg-rust-600 disabled:opacity-50"
            >
              Submit
            </button>
          </div>
        </div>
      )}
      {loading && (
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Agent running (30–90 sec).{" "}
          {liveUrl ? (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-rust-600"
            >
              Watch live
            </a>
          ) : (
            <a
              href="https://cloud.browser-use.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-rust-600"
            >
              cloud.browser-use.com
            </a>
          )}
        </p>
      )}
      {result && (
        <p className="text-xs text-green-600 dark:text-green-400">{result}</p>
      )}
      {error && (
        <div className="space-y-1">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          {liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline hover:text-rust-600"
            >
              Watch session replay
            </a>
          )}
          {debug && (
            <pre className="text-[10px] text-left bg-stone-200 dark:bg-stone-800 p-2 rounded overflow-x-auto max-h-32 overflow-y-auto">
              {JSON.stringify(debug, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
