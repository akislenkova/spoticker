import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import SignOutButton from "./SignOutButton";

export default async function AuthHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80">
      <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="text-sm font-medium text-zinc-200 hover:text-white">
          Spoticker
        </Link>
        <nav className="flex items-center gap-4 text-xs">
          {user ? (
            <>
              <span className="text-zinc-500 truncate max-w-[200px]">{user.email}</span>
              <Link href="/connect" className="text-zinc-400 hover:text-zinc-200">
                Connect AWS
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link href="/connect" className="text-zinc-400 hover:text-zinc-200">
              Connect AWS
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
