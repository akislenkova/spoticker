/** Shared Supabase env resolution for server and client. */
export function getSupabaseUrl(): string {
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    ""
  ).trim();
  if (!url) {
    throw new Error(
      "Missing Supabase URL. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in ui/.env.local"
    );
  }
  return url;
}

/** Service-role key (server only). */
export function getSupabaseServiceKey(): string {
  const key = (
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_KEY ??
    ""
  ).trim();
  if (!key) {
    throw new Error(
      "Missing Supabase service key. Set SUPABASE_SERVICE_KEY (or SUPABASE_KEY) in ui/.env.local"
    );
  }
  return key;
}

export function getSupabaseAnonKey(): string {
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in ui/.env.local (Project Settings → API → anon public)"
    );
  }
  return key;
}
