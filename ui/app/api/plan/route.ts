import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedSupabase, rateLimitedResponse } from "@/lib/aws-api";
import { rateLimit } from "@/lib/rate-limit";

const PLAN_SERVICE_URL = process.env.PLAN_SERVICE_URL ?? "http://localhost:8001";
const PLAN_SERVICE_SECRET = process.env.PLAN_SERVICE_SECRET;

// Each analysis runs up to two Claude calls, so it requires a signed-in user.
export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedSupabase();
  if (auth.response) return auth.response;
  const { user } = auth;

  const rl = rateLimit(`plan:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);

  if (!PLAN_SERVICE_SECRET && process.env.NODE_ENV === "production") {
    console.error("/api/plan: PLAN_SERVICE_SECRET is not set; refusing to call plan service");
    return NextResponse.json({ error: "Plan service is not configured." }, { status: 503 });
  }

  const form = await req.formData();

  const headers: Record<string, string> = {};
  if (PLAN_SERVICE_SECRET) {
    headers["Authorization"] = `Bearer ${PLAN_SERVICE_SECRET}`;
  }

  try {
    const upstream = await fetch(`${PLAN_SERVICE_URL}/analyze`, {
      method: "POST",
      headers,
      body: form,
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data.detail ?? "Plan service error." },
        { status: upstream.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/plan error", message);
    return NextResponse.json(
      { error: `Plan service unreachable: ${message}` },
      { status: 503 }
    );
  }
}
