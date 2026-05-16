import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSpotPlacementScores } from "@/lib/aws-assume";
import { auditAwsEvent, AWS_CONNECTION_COOKIE } from "@/lib/aws-security";
import { getAuthenticatedSupabase, rateLimitedResponse } from "@/lib/aws-api";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/aws/sps — uses httpOnly connection cookie; RLS enforces ownership

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedSupabase();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const rlUser = rateLimit(`aws:sps:${user.id}`, 120, 60 * 60 * 1000);
  if (!rlUser.ok) return rateLimitedResponse(rlUser.retryAfterSec);
  const rlIp = rateLimit(`aws:sps:ip:${ip}`, 240, 60 * 60 * 1000);
  if (!rlIp.ok) return rateLimitedResponse(rlIp.retryAfterSec);

  const cookieStore = await cookies();
  const connectionId = cookieStore.get(AWS_CONNECTION_COOKIE)?.value;
  if (!connectionId) {
    return NextResponse.json({ error: "No AWS connection" }, { status: 400 });
  }

  const { data: conn, error } = await supabase
    .from("aws_connections")
    .select("role_arn, external_id, status")
    .eq("id", connectionId)
    .single();

  if (error || !conn) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }
  if (conn.status !== "connected" || !conn.role_arn) {
    return NextResponse.json({ error: "Connection not verified" }, { status: 400 });
  }

  try {
    const raw = await getSpotPlacementScores(conn.role_arn, conn.external_id);
    const scores: Record<string, number> = {};
    for (const s of raw) {
      scores[`${s.region}::${s.instanceType}`] = s.score;
    }

    auditAwsEvent("sps_ok", {
      userId: user.id,
      connectionId,
      regionCount: Object.keys(scores).length,
    });

    return NextResponse.json({ scores });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("aws sps failed", { userId: user.id, connectionId, msg });
    auditAwsEvent("sps_fail", { userId: user.id, connectionId });
    return NextResponse.json({ error: "Could not fetch Spot Placement Scores" }, { status: 500 });
  }
}
