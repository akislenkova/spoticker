import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AWS_CONNECTION_COOKIE } from "@/lib/aws-security";
import { getAuthenticatedSupabase } from "@/lib/aws-api";

// GET /api/aws/status — whether the signed-in user has an active AWS connection

export async function GET() {
  const auth = await getAuthenticatedSupabase();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  const cookieStore = await cookies();
  const connectionId = cookieStore.get(AWS_CONNECTION_COOKIE)?.value;

  if (!connectionId) {
    return NextResponse.json({ connected: false });
  }

  const { data: conn } = await supabase
    .from("aws_connections")
    .select("id, status, account_id, connected_at")
    .eq("id", connectionId)
    .single();

  if (!conn || conn.status !== "connected") {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    connectionId: conn.id,
    accountId: conn.account_id,
    connectedAt: conn.connected_at,
  });
}
