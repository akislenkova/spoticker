import { createClient } from "@supabase/supabase-js";

/** Service-role client for server jobs (matrix, recommend, telemetry). Bypasses RLS. */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  }
  return createClient(url, key);
}

/** @deprecated Use createAdminClient — kept for existing imports */
export const supabase = createAdminClient();
