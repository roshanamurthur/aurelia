"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn("password", { email, password, flow: "signIn" });
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) {
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-white">
      <Link href="/" className="mb-8">
        <img src="/aurelia-logo.png" alt="Aurelia" className="w-12 h-12 object-contain" />
      </Link>
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-black text-center mb-6">
          Sign in to Aurelia
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-black mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border-2 border-black bg-white text-black focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-black mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border-2 border-black bg-white text-black focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
            />
          </div>
          {error && (
            <p className="text-sm text-black">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 border-2 border-black bg-black hover:bg-white hover:text-black disabled:opacity-50 text-white font-medium transition-colors"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-black">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium underline hover:no-underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
