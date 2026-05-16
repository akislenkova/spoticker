import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSpotPlacementScores } from "@/lib/aws-assume";

// POST /api/aws/sps  { connection_id }
// Assumes the user's role and returns Spot Placement Scores for GPU instance types.

export async function POST(req: NextRequest) {
  const { connection_id } = await req.json();
  if (!connection_id) {
    return NextResponse.json({ error: "connection_id required" }, { status: 400 });
  }

  const { data: conn, error } = await supabase
    .from("aws_connections")
    .select("role_arn, external_id, status")
    .eq("id", connection_id)
    .single();

  if (error || !conn) {
    return NextResponse.json({ error: "connection not found" }, { status: 404 });
  }
  if (conn.status !== "connected") {
    return NextResponse.json({ error: "connection not verified" }, { status: 400 });
  }

  try {
    const raw = await getSpotPlacementScores(conn.role_arn, conn.external_id);
    // Flatten to { region: score }
    const scores: Record<string, number> = {};
    for (const s of raw) {
      if (s.Region && s.Score != null) scores[s.Region] = s.Score;
    }
    return NextResponse.json({ scores });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
