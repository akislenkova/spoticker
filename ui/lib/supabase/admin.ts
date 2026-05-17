import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceKey, getSupabaseUrl } from "./env";

/** Service-role client for server jobs (matrix, recommend, telemetry). Bypasses RLS. */
export function createAdminClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getSupabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let _admin: SupabaseClient | undefined;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_admin) _admin = createAdminClient();
  return _admin;
}

/** Lazy proxy so env is read at request time, not module import time. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseAdmin();
    const value = Reflect.get(client, prop, client);
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});
