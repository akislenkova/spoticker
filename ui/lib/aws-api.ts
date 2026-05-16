import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/aws-security";
import { NextResponse } from "next/server";

export async function getAuthenticatedSupabase() {
  const supabase = await createClient();
  const user = await requireUser(() => supabase.auth.getUser());
  if (!user) {
    return { supabase: null as null, user: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { supabase, user, response: null };
}

export function rateLimitedResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Too many requests. Try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}
