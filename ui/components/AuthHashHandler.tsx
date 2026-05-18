"use client";

import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Handles implicit-flow tokens in the URL hash (#access_token=…).
 * PKCE magic links use ?code= on /auth/callback instead; this covers older templates.
 */
export default function AuthHashHandler() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token")) return;

    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (session) {
        router.refresh();
      } else {
        router.replace("/login?error=auth&reason=hash");
      }
    });
  }, [router]);

  return null;
}
