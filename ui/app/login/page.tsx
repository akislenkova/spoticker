"use client";

import { createClient } from "@/lib/supabase/browser";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const authError = params.get("error") === "auth";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");

    const supabase = createClient();

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setStatus("error");
      const isRateLimit =
        error.message.toLowerCase().includes("rate") ||
        error.message.toLowerCase().includes("too many") ||
        error.status === 429;
      setMessage(
        isRateLimit
          ? "Please wait a minute before requesting a new link."
          : "Could not send sign-in link. Try again."
      );
      return;
    }

    setStatus("sent");
    setMessage("Check your email for a sign-in link.");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sign in to Spoticker</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Use your email to connect AWS and view Spot Placement Scores.
          </p>
        </div>

        {authError && (
          <p className="text-sm text-red-400">Sign-in failed. Request a new link.</p>
        )}

        {status === "sent" ? (
          <p className="text-sm text-emerald-400">{message}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs text-zinc-500 uppercase tracking-wider">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400"
              />
            </div>
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full py-2.5 rounded-lg bg-white text-black font-medium hover:bg-zinc-200 transition-colors disabled:opacity-40"
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
            {status === "error" && <p className="text-sm text-red-400">{message}</p>}
          </form>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <LoginForm />
    </Suspense>
  );
}
