"use client";

import { createClient } from "@/lib/supabase/browser";
import type { EmailOtpType } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

function AuthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const supabase = createClient();
    const next = (() => {
      const n = searchParams.get("next");
      if (n && n.startsWith("/") && !n.startsWith("//")) return n;
      return "/connect";
    })();

    const code = searchParams.get("code");
    const token_hash = searchParams.get("token_hash");
    const type = searchParams.get("type") as EmailOtpType | null;

    async function finish() {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          const reason = /verifier|code challenge|invalid flow/i.test(error.message)
            ? "different_browser"
            : "exchange";
          router.replace(`/login?error=auth&reason=${reason}`);
          return;
        }
      } else if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ type, token_hash });
        if (error) {
          router.replace("/login?error=auth&reason=otp");
          return;
        }
      } else {
        router.replace("/login?error=auth&reason=missing");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login?error=auth&reason=no_user");
        return;
      }

      router.replace(next);
      router.refresh();
    }

    void finish();
  }, [router, searchParams]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <p className="text-sm text-zinc-400 animate-pulse">Signing you in…</p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <p className="text-sm text-zinc-400 animate-pulse">Signing you in…</p>
        </main>
      }
    >
      <AuthCallbackHandler />
    </Suspense>
  );
}
