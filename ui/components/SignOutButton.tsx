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
      className="text-xs text-zinc-500 hover:text-zinc-300 underline"
    >
      Sign out
    </button>
  );
}
