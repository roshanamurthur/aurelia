"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface RegenerateButtonProps {
  userId: string;
  numDays: number;
  mealsPerDay: number;
  startDate: string;
}

export default function RegenerateButton({ userId, numDays, mealsPerDay, startDate }: RegenerateButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRegenerate() {
    setLoading(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";
      await fetch(`${baseUrl}/api/meal-plan/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, numDays, mealsPerDay, startDate }),
      });
      router.refresh();
    } catch (e) {
      console.error("Regenerate failed:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleRegenerate}
      disabled={loading}
      className="text-sm px-3 py-1.5 rounded-lg bg-rust-500/80 hover:bg-rust-600 disabled:opacity-50 text-white font-medium transition-colors"
    >
      {loading ? "Regenerating..." : "Regenerate Week"}
    </button>
  );
}
