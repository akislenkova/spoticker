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
      if (isRateLimit) {
        setMessage("Please wait a minute before requesting a new link.");
      } else if (
        error.message.toLowerCase().includes("not authorized") ||
        error.message.toLowerCase().includes("email address not authorized")
      ) {
        setMessage(
          "This address cannot receive auth emails yet. Enable custom SMTP in Supabase (Authentication → SMTP) or add the address to your Supabase org team while testing."
        );
      } else if (
        error.message.toLowerCase().includes("sending confirmation email") ||
        error.message.toLowerCase().includes("sending magic link")
      ) {
        setMessage(
          "Supabase could not send the email (SMTP). In the dashboard check Authentication → SMTP (host smtp.agentmail.to, port 465, user anna@spoticker.com, sender anna@spoticker.com) and AgentMail → Domains that spoticker.com is verified."
        );
      } else if (error.message.toLowerCase().includes("redirect")) {
        setMessage(
          `Redirect URL not allowed. Add ${buildAuthCallbackUrl("/connect")} under Supabase → Authentication → URL Configuration → Redirect URLs.`
        );
      } else {
        setMessage(`Could not send link: ${error.message}`);
      }
      return;
    }

    setStatus("sent");
    setMessage("");
  }

  return (
    <div className="space-y-4">
      <p className="font-mono text-sm text-[#4a6a58]">
        Enter your email — we&apos;ll send a one-time link, then you&apos;ll set up a read-only
        IAM role in AWS (about 2–3 minutes).
      </p>

      {authError && <p className="font-mono text-sm text-[#d07080]">{authErrorMessage}</p>}

      {status === "sent" ? (
        <div className="rounded border border-[rgba(0,255,136,0.2)] bg-[rgba(0,255,136,0.05)] px-4 py-5 space-y-3">
          <p className="font-mono text-sm font-medium text-[#00ff88]">Check your email</p>
          <p className="font-mono text-sm text-[#4a6a58]">
            We sent a sign-in link to{" "}
            <span className="text-[#c8f0dc]">{email.trim()}</span>. Open it in this browser, then
            you&apos;ll continue with AWS setup here.
          </p>
          <p className="font-mono text-[10px] text-[#2d4038]">
            No mail? Check spam, or wait a minute and try again.
          </p>
        </div>
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
