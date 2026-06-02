/** Shared Supabase env resolution for server and client. */

export type SupabaseKeyFormat = "jwt" | "publishable" | "unknown";

export function detectSupabaseKeyFormat(key: string): SupabaseKeyFormat {
  const k = key.trim();
  if (k.startsWith("eyJ")) return "jwt";
  if (k.startsWith("sb_publishable_")) return "publishable";
  return "unknown";
}

function assertNotProjectUrl(value: string, varName: string): void {
  if (value.includes("supabase.co")) {
    throw new Error(
      `${varName} must be an API key, not your project URL. Open spoticker at http://localhost:3000 or your Vercel URL. Do not paste *.supabase.co into the browser.`
    );
  }
}

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
  if (!url.startsWith("https://") || !url.includes(".supabase.co")) {
    throw new Error(
      `${url} does not look like a Supabase project URL (expected https://xxxx.supabase.co)`
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
  assertNotProjectUrl(key, "SUPABASE_SERVICE_KEY");
  if (detectSupabaseKeyFormat(key) === "publishable") {
    throw new Error(
      "SUPABASE_SERVICE_KEY must be the service_role secret (eyJ…), not the publishable key."
    );
  }
  return key;
}

export function getSupabaseAnonKey(): string {
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in ui/.env.local (Supabase → Project Settings → API → anon public, eyJ…)"
    );
  }
  assertNotProjectUrl(key, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const format = detectSupabaseKeyFormat(key);
  if (format === "unknown") {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY must be the anon public key (eyJ…). Copy it from Supabase → API, not the project URL."
    );
  }
  return key;
}

/** Safe status for /api/health (no secrets). */
export function getSupabaseEnvStatus(): {
  url: boolean;
  anonKey: boolean;
  anonKeyFormat: SupabaseKeyFormat | null;
  serviceKey: boolean;
  serviceKeyFormat: SupabaseKeyFormat | null;
} {
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    ""
  ).trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const service = (
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_KEY ??
    ""
  ).trim();
  return {
    url: url.length > 0,
    anonKey: anon.length > 0,
    anonKeyFormat: anon ? detectSupabaseKeyFormat(anon) : null,
    serviceKey: service.length > 0,
    serviceKeyFormat: service ? detectSupabaseKeyFormat(service) : null,
  };
}
