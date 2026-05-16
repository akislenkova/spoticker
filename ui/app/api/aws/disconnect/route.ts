import { NextResponse } from "next/server";
import { AWS_CONNECTION_COOKIE, connectionCookieOptions } from "@/lib/aws-security";
import { getAuthenticatedSupabase } from "@/lib/aws-api";

// POST /api/aws/disconnect — clears the active connection cookie

export async function POST() {
  const auth = await getAuthenticatedSupabase();
  if (auth.response) return auth.response;

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AWS_CONNECTION_COOKIE, "", {
    ...connectionCookieOptions(0),
    maxAge: 0,
  });
  return response;
}
