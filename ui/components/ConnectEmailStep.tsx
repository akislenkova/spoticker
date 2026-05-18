"use client";

import { buildAuthCallbackUrl } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/browser";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ConnectEmailForm() {
  const params = useSearchParams();
  const authError = params.get("error") === "auth";
  const authReason = params.get("reason") ?? "";

  const authErrorMessage =
    authReason === "different_browser"
      ? "Open the link in the same browser where you entered your email."
      : authReason === "missing"
        ? "Link was incomplete or expired. Request a new one below."
        : authReason === "otp" || authReason === "exchange"
          ? "Link expired or already used. Request a new one below."
          : "Could not verify your email. Request a new link below.";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");

    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: buildAuthCallbackUrl("/connect") },
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
          : "Could not send link. Try again."
      );
      return;
    }

    setStatus("sent");
    setMessage("Check your email, then continue here to deploy the IAM role.");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Enter your email — we&apos;ll send a one-time link, then you&apos;ll set up a read-only
        IAM role in AWS (about 2–3 minutes).
      </p>

      {authError && <p className="text-sm text-red-400">{authErrorMessage}</p>}

      {status === "sent" ? (
        <p className="text-sm text-emerald-400">{message}</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="connect-email" className="text-xs text-zinc-500 uppercase tracking-wider">
              Email
            </label>
            <input
              id="connect-email"
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
            {status === "sending" ? "Sending…" : "Continue with email"}
          </button>
          {status === "error" && <p className="text-sm text-red-400">{message}</p>}
        </form>
      )}
    </div>
  );
}

export default function ConnectEmailStep() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500 animate-pulse">Loading…</p>}>
      <ConnectEmailForm />
    </Suspense>
  );
}
