import { NextRequest, NextResponse } from "next/server";
import { assumeRole, getCallerAccountId } from "@/lib/aws-assume";
import {
  auditAwsEvent,
  AWS_CONNECTION_COOKIE,
  connectionCookieOptions,
  isValidRoleArn,
} from "@/lib/aws-security";
import { getAuthenticatedSupabase, rateLimitedResponse } from "@/lib/aws-api";
import { rateLimit } from "@/lib/rate-limit";
import { formatAwsError } from "@/lib/aws-errors";
import { isSpottickerAwsConfigured } from "@/lib/aws-credentials";
import {
  createPendingConnection,
  getConnectionForUser,
  markConnectionConnected,
  markConnectionError,
} from "@/lib/aws-db";

// POST /api/aws/connect  { action: "init" }
// POST /api/aws/connect  { action: "verify", id, role_arn }

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedSupabase();
  if (auth.response) return auth.response;
  const { user } = auth;

  const body = await req.json();

  if (body.action === "init") {
    const rl = rateLimit(`aws:init:${user.id}`, 20, 60 * 60 * 1000);
    if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);

    if (!isSpottickerAwsConfigured()) {
      return NextResponse.json(
        {
          error: "AWS connect is not configured on the server.",
          hint:
            "Add SPOTTICKER_AWS_ACCESS_KEY_ID and SPOTTICKER_AWS_SECRET_ACCESS_KEY to ui/.env.local (IAM user in 601883338057 with sts:AssumeRole). See aws/iam/README.md.",
        },
        { status: 503 }
      );
    }

    try {
      const data = await createPendingConnection(user.id);
      auditAwsEvent("init", { userId: user.id, connectionId: data.id });
      return NextResponse.json(data);
    } catch (err) {
      console.error("aws connect init", err);
      return NextResponse.json({ error: "Could not start connection" }, { status: 500 });
    }
  }

  if (body.action === "verify") {
    const { id, role_arn } = body;
    if (!id || !role_arn) {
      return NextResponse.json({ error: "id and role_arn required" }, { status: 400 });
    }
    if (!isValidRoleArn(role_arn)) {
      return NextResponse.json({ error: "Invalid role ARN format" }, { status: 400 });
    }

    const rl = rateLimit(`aws:verify:${user.id}`, 30, 60 * 60 * 1000);
    if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);

    const conn = await getConnectionForUser(user.id, id);
    if (!conn) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (conn.status === "connected") {
      return NextResponse.json({ error: "Connection already verified" }, { status: 400 });
    }
    if (conn.status !== "pending" && conn.status !== "error") {
      return NextResponse.json({ error: "Invalid connection state" }, { status: 400 });
    }

    if (!isSpottickerAwsConfigured()) {
      return NextResponse.json(
        {
          error: "AWS connect is not configured on the server.",
          hint:
            "Add SPOTTICKER_AWS_ACCESS_KEY_ID and SPOTTICKER_AWS_SECRET_ACCESS_KEY to ui/.env.local.",
        },
        { status: 503 }
      );
    }

    try {
      const creds = await assumeRole(role_arn, conn.external_id);
      const accountId = await getCallerAccountId(creds);

      await markConnectionConnected(user.id, id, role_arn, accountId);

      auditAwsEvent("verify_ok", {
        userId: user.id,
        connectionId: id,
        accountId,
      });

      const response = NextResponse.json({ status: "connected", accountId });
      response.cookies.set(AWS_CONNECTION_COOKIE, id, connectionCookieOptions());
      return response;
    } catch (err: unknown) {
      const { message, hint } = formatAwsError(err);
      console.error("aws connect verify failed", {
        userId: user.id,
        connectionId: id,
        message,
      });

      await markConnectionError(user.id, id, message);

      auditAwsEvent("verify_fail", { userId: user.id, connectionId: id });
      return NextResponse.json({ error: message, hint }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
