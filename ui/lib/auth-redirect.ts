/** Canonical app origin for magic-link redirects (must match Supabase Auth URL config). */
export function getAppOrigin(): string {
  // In the browser, always use the tab the user is on (avoids localhost vs :3001 mismatches).
  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeOrigin(window.location.origin);
  }
  const fromEnv = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (fromEnv) {
    return normalizeOrigin(fromEnv);
  }
  return "http://localhost:3000";
}

function normalizeOrigin(value: string): string {
  let url = value.trim();
  if (!url) throw new Error("Empty site URL");

  // Common misconfig: "spoticker.com" or "://spoticker.com"
  if (!/^https?:\/\//i.test(url)) {
    if (url.startsWith("://")) url = url.slice(3);
    url = `https://${url.replace(/^\/+/, "")}`;
  }

  const parsed = new URL(url);
  if (!parsed.protocol.startsWith("http")) {
    throw new Error(`Invalid site URL: ${value}`);
  }
  return parsed.origin;
}

export function buildAuthCallbackUrl(nextPath: string = "/"): string {
  const origin = getAppOrigin();
  const next =
    nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}
