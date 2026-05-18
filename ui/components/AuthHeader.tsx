import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import SignOutButton from "./SignOutButton";

export default async function AuthHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-[rgba(0,255,136,0.09)] bg-[rgba(3,10,8,0.95)] backdrop-blur-sm">
      <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="group flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-[rgba(0,255,136,0.4)] tracking-widest select-none">[</span>
          <span className="font-mono font-bold text-sm tracking-[0.18em] text-[#00ff88] neon-glow group-hover:tracking-[0.22em] transition-all duration-200">
            SPOTICKER
          </span>
          <span className="font-mono text-[11px] text-[rgba(0,255,136,0.4)] tracking-widest select-none">]</span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-5 font-mono text-xs">
          {user ? (
            <>
              <span className="text-[#2d4038] truncate max-w-[200px] tracking-wide">{user.email}</span>
              <Link
                href="/connect"
                className="text-[#4a6a58] hover:text-[#00ff88] transition-colors tracking-wider"
              >
                // aws
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/connect"
              className="text-[#4a6a58] hover:text-[#00ff88] transition-colors tracking-wider"
            >
              // connect aws
            </Link>
          )}
          <span className="status-dot" />
        </nav>
      </div>
    </header>
  );
}
