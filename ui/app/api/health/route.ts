import { getSupabaseEnvStatus } from "@/lib/supabase/env";
import { isSpottickerAwsConfigured } from "@/lib/aws-credentials";
import { NextResponse } from "next/server";

/** Env check for local dev / Vercel — never returns secret values. */
export async function GET() {
  const supabase = getSupabaseEnvStatus();
  const ok =
    supabase.url &&
    supabase.anonKey &&
    supabase.serviceKey &&
    supabase.anonKeyFormat === "jwt";

  return NextResponse.json({
    ok,
    supabase,
    awsConnect: isSpottickerAwsConfigured(),
    hints: !ok
      ? [
          supabase.anonKeyFormat === "publishable"
            ? "Set NEXT_PUBLIC_SUPABASE_ANON_KEY to the legacy anon JWT (eyJ…), not sb_publishable_…, then redeploy."
            : null,
          !supabase.anonKey
            ? "Add NEXT_PUBLIC_SUPABASE_ANON_KEY to ui/.env.local or Vercel env vars."
            : null,
          "Opening https://xxxx.supabase.co in the browser shows “No API key” — use your app URL instead.",
        ].filter(Boolean)
      : [],
  });
}
