"use client";

import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Catches auth params when Supabase redirects to the site root (or wrong path):
 * - ?code=… (PKCE) → forward to /auth/callback for browser-side exchange
 * - #access_token=… (implicit) → establish session in-browser
 */
export default function AuthHashHandler() {
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;

    const { pathname, search, hash } = window.location;

    const params = new URLSearchParams(search);
    const code = params.get("code");
    const token_hash = params.get("token_hash");
    const type = params.get("type");

    if (pathname !== "/auth/callback" && (code || (token_hash && type))) {
      handled.current = true;
      router.replace(`/auth/callback${search}`);
      return;
    }

    if (!hash.includes("access_token")) return;

    handled.current = true;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      window.history.replaceState(null, "", pathname + search);
      if (session) {
        router.refresh();
      } else {
        router.replace("/login?error=auth&reason=hash");
      }
    });
  }, [router]);

  return null;
}
