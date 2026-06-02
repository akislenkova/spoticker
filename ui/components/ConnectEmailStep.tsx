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
      <p className="font-mono text-sm text-[#4a6a58]">
        Enter your email. We&apos;ll send a one-time link, then you&apos;ll set up a read-only
        IAM role in AWS (about 2–3 minutes).
      </p>

      {authError && <p className="font-mono text-sm text-[#d07080]">{authErrorMessage}</p>}

      {status === "sent" ? (
        <p className="font-mono text-sm text-[#00ff88]">{message}</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="connect-email" className="font-mono text-[10px] text-[#2d4038] uppercase tracking-[0.2em]">
              Email
            </label>
            <input
              id="connect-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[rgba(0,4,3,0.8)] border border-[rgba(0,255,136,0.12)] rounded px-3 py-2 font-mono text-sm text-[#c8f0dc] placeholder:text-[#1e3028] focus:outline-none focus:border-[rgba(0,255,136,0.35)] focus:shadow-[0_0_12px_rgba(0,255,136,0.08)] transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full py-2.5 rounded border border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.08)] font-mono font-medium text-[#00ff88] hover:bg-[rgba(0,255,136,0.14)] hover:border-[rgba(0,255,136,0.5)] hover:shadow-[0_0_16px_rgba(0,255,136,0.12)] transition-all disabled:opacity-40"
          >
            {status === "sending" ? "&gt;_ Sending…" : "&gt; Continue with email"}
          </button>
          {status === "error" && (
            <p className="font-mono text-sm text-[#d07080]">{message}</p>
          )}
        </form>
      )}
    </div>
  );
}

export default function ConnectEmailStep() {
  return (
    <Suspense fallback={<p className="font-mono text-sm text-[#2d4038] animate-pulse">Loading…</p>}>
      <ConnectEmailForm />
    </Suspense>
  );
}
