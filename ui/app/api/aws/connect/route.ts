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

// POST /api/aws/connect  { action: "init" }
// POST /api/aws/connect  { action: "verify", id, role_arn }

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedSupabase();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  const body = await req.json();

  if (body.action === "init") {
    const rl = rateLimit(`aws:init:${user.id}`, 20, 60 * 60 * 1000);
    if (!rl.ok) return rateLimitedResponse(rl.retryAfterSec);

    const { data, error } = await supabase
      .from("aws_connections")
      .insert({ user_id: user.id })
      .select("id, external_id")
      .single();

    if (error) {
      console.error("aws connect init", error);
      return NextResponse.json({ error: "Could not start connection" }, { status: 500 });
    }

    auditAwsEvent("init", { userId: user.id, connectionId: data.id });
    return NextResponse.json(data);
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

    const { data: conn, error: fetchErr } = await supabase
      .from("aws_connections")
      .select("external_id, status")
      .eq("id", id)
      .single();

    if (fetchErr || !conn) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (conn.status !== "pending") {
      return NextResponse.json({ error: "Connection already configured" }, { status: 400 });
    }

    try {
      const creds = await assumeRole(role_arn, conn.external_id);
      const accountId = await getCallerAccountId(creds);

      const { error: updateErr } = await supabase
        .from("aws_connections")
        .update({
          role_arn,
          account_id: accountId,
          status: "connected",
          connected_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", id)
        .eq("status", "pending");

      if (updateErr) {
        console.error("aws connect verify update", updateErr);
        return NextResponse.json({ error: "Could not save connection" }, { status: 500 });
      }

      auditAwsEvent("verify_ok", {
        userId: user.id,
        connectionId: id,
        accountId,
      });

      const response = NextResponse.json({ status: "connected" });
      response.cookies.set(AWS_CONNECTION_COOKIE, id, connectionCookieOptions());
      return response;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("aws connect verify failed", { userId: user.id, connectionId: id, msg });

      await supabase
        .from("aws_connections")
        .update({ status: "error", error: msg })
        .eq("id", id)
        .eq("status", "pending");

      auditAwsEvent("verify_fail", { userId: user.id, connectionId: id });
      return NextResponse.json({ error: "Could not verify AWS connection" }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
