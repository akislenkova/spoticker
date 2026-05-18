"use client";

import { createClient } from "@/lib/supabase/browser";

export default function SignOutButton() {
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="font-mono text-xs text-[#2d4038] hover:text-[rgba(0,255,136,0.7)] tracking-wider transition-colors"
    >
      // sign out
    </button>
  );
}
