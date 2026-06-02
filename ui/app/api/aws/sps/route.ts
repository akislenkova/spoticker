import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSpotPlacementScores } from "@/lib/aws-assume";
import { auditAwsEvent, AWS_CONNECTION_COOKIE } from "@/lib/aws-security";
import { getAuthenticatedSupabase, rateLimitedResponse } from "@/lib/aws-api";
import { rateLimit } from "@/lib/rate-limit";
import { formatAwsError } from "@/lib/aws-errors";
import { isSpottickerAwsConfigured } from "@/lib/aws-credentials";
import { getConnectionForUser, getLatestConnectedForUser } from "@/lib/aws-db";

// POST /api/aws/sps: uses httpOnly connection cookie; user_id enforced server-side

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedSupabase();
  if (auth.response) return auth.response;
  const { user } = auth;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const rlUser = rateLimit(`aws:sps:${user.id}`, 120, 60 * 60 * 1000);
  if (!rlUser.ok) return rateLimitedResponse(rlUser.retryAfterSec);
  const rlIp = rateLimit(`aws:sps:ip:${ip}`, 240, 60 * 60 * 1000);
  if (!rlIp.ok) return rateLimitedResponse(rlIp.retryAfterSec);

  if (!isSpottickerAwsConfigured()) {
    return NextResponse.json(
      {
        error: "AWS connect is not configured on the server.",
        hint: "Set SPOTTICKER_AWS_ACCESS_KEY_ID and SPOTTICKER_AWS_SECRET_ACCESS_KEY in ui/.env.local.",
      },
      { status: 503 }
    );
  }

  const cookieStore = await cookies();
  let connectionId = cookieStore.get(AWS_CONNECTION_COOKIE)?.value;

  let conn =
    connectionId != null
      ? await getConnectionForUser(user.id, connectionId)
      : null;

  if (!conn || conn.status !== "connected") {
    const latest = await getLatestConnectedForUser(user.id);
    if (latest) {
      conn = await getConnectionForUser(user.id, latest.id);
      connectionId = latest.id;
    }
  }

  if (!conn || conn.status !== "connected" || !conn.role_arn) {
    return NextResponse.json(
      { error: "No AWS connection", hint: "Connect AWS at /connect." },
      { status: 400 }
    );
  }

  try {
    const raw = await getSpotPlacementScores(conn.role_arn, conn.external_id);
    const scores: Record<string, number> = {};
    for (const s of raw) {
      scores[`${s.region}::${s.instanceType}`] = s.score;
    }

    auditAwsEvent("sps_ok", {
      userId: user.id,
      connectionId: conn.id,
      regionCount: Object.keys(scores).length,
    });

    return NextResponse.json({ scores });
  } catch (err: unknown) {
    const { message, hint } = formatAwsError(err);
    console.error("aws sps failed", { userId: user.id, connectionId: conn.id, message });
    auditAwsEvent("sps_fail", { userId: user.id, connectionId: conn.id });
    return NextResponse.json({ error: message, hint }, { status: 500 });
  }
}
