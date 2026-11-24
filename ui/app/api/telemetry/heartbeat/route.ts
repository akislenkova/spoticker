import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkTelemetrySecret } from "@/lib/telemetry-auth";

export async function POST(req: NextRequest) {
  const denied = checkTelemetrySecret(req);
  if (denied) return denied;

  const { vm_id, region, sku } = await req.json();
  if (!vm_id || !region || !sku) {
    return NextResponse.json({ error: "vm_id, region, sku required" }, { status: 400 });
  }

  await Promise.all([
    supabase.from("heartbeats").insert({ vm_id, region, sku }),
    supabase
      .from("monitored_vms")
      .update({ last_heartbeat: new Date().toISOString(), status: "running" })
      .eq("vm_id", vm_id),
  ]);

  return NextResponse.json({ ok: true });
}
