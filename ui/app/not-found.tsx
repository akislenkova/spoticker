import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <p className="font-mono text-[10px] tracking-[0.25em] text-[rgba(0,255,136,0.4)] uppercase">// 404</p>
        <h1 className="text-xl font-bold text-[#c8f0dc] tracking-tight">Page not found</h1>
        <p className="font-mono text-sm text-[#3a5a48] leading-relaxed">
          This URL is not part of Spoticker. The matrix lives on the home page. Do not open
          your <code className="text-[#4a6a58]">*.supabase.co</code> project link in the browser.
        </p>
        <div className="flex flex-wrap justify-center gap-3 text-sm">
          <Link
            href="/"
            className="px-4 py-2 rounded border border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.08)] font-mono font-medium text-[#00ff88] hover:bg-[rgba(0,255,136,0.14)] hover:shadow-[0_0_12px_rgba(0,255,136,0.12)] transition-all"
          >
            spot matrix
          </Link>
          <Link
            href="/connect"
            className="px-4 py-2 rounded border border-[rgba(0,255,136,0.12)] font-mono text-[#4a6a58] hover:border-[rgba(0,255,136,0.25)] hover:text-[#7aab8e] transition-all"
          >
            Connect AWS
          </Link>
        </div>
      </div>
    </main>
  );
}
