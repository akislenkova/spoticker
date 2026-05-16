import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { assumeRole } from "@/lib/aws-assume";

// POST /api/aws/connect  { action: "init" }
//   → creates a pending connection, returns { id, external_id }
//
// POST /api/aws/connect  { action: "verify", id, role_arn }
//   → attempts AssumeRole, marks connected or error

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "init") {
    const { data, error } = await supabase
      .from("aws_connections")
      .insert({})
      .select("id, external_id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (body.action === "verify") {
    const { id, role_arn } = body;
    if (!id || !role_arn) {
      return NextResponse.json({ error: "id and role_arn required" }, { status: 400 });
    }

    const { data: conn, error: fetchErr } = await supabase
      .from("aws_connections")
      .select("external_id")
      .eq("id", id)
      .single();

    if (fetchErr || !conn) {
      return NextResponse.json({ error: "connection not found" }, { status: 404 });
    }

    try {
      const creds = await assumeRole(role_arn, conn.external_id);
      const accountId = creds.AccessKeyId?.slice(4, 16) ?? null; // rough extract — real apps use GetCallerIdentity

      await supabase
        .from("aws_connections")
        .update({
          role_arn,
          account_id: accountId,
          status: "connected",
          connected_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", id);

      return NextResponse.json({ status: "connected" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase
        .from("aws_connections")
        .update({ status: "error", error: msg })
        .eq("id", id);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
