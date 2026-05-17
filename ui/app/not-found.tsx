import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex-1 flex items-center justify-center p-6 bg-zinc-950 text-zinc-100">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold text-zinc-200">Page not found</h1>
        <p className="text-sm text-zinc-500">
          This URL is not part of Spoticker. The matrix lives on the home page — do not open
          your <code className="text-zinc-400">*.supabase.co</code> project link in the browser.
        </p>
        <div className="flex flex-wrap justify-center gap-3 text-sm">
          <Link
            href="/"
            className="px-4 py-2 rounded-lg bg-white text-black font-medium hover:bg-zinc-200"
          >
            GPU matrix
          </Link>
          <Link
            href="/login"
            className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500"
          >
            Sign in
          </Link>
          <Link
            href="/connect"
            className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500"
          >
            AWS connect
          </Link>
        </div>
      </div>
    </main>
  );
}
