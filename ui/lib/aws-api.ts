import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function getAuthenticatedSupabase() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    console.error("aws api auth getUser", error.message);
  }
  if (!user) {
    return {
      supabase: null as null,
      user: null,
      response: NextResponse.json(
        { error: "Unauthorized", hint: "Continue at /connect to verify your email." },
        { status: 401 }
      ),
    };
  }
  return { supabase, user, response: null };
}

export function rateLimitedResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Too many requests. Try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}
