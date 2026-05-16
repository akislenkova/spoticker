"use client";

import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
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
