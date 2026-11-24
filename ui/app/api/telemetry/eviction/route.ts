import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkTelemetrySecret } from "@/lib/telemetry-auth";

export async function POST(req: NextRequest) {
  const denied = checkTelemetrySecret(req);
  if (denied) return denied;

  const { vm_id, region, sku, method } = await req.json();
  if (!vm_id || !region || !sku || !method) {
    return NextResponse.json({ error: "vm_id, region, sku, method required" }, { status: 400 });
  }

  // Compute uptime from started_at
  const { data: vm } = await supabase
    .from("monitored_vms")
    .select("started_at")
    .eq("vm_id", vm_id)
    .single();

  const uptime_seconds = vm?.started_at
    ? Math.floor((Date.now() - new Date(vm.started_at).getTime()) / 1000)
    : null;

  await Promise.all([
    supabase.from("eviction_events").insert({ vm_id, region, sku, detection_method: method, uptime_seconds }),
    supabase.from("monitored_vms").update({ status: "evicted" }).eq("vm_id", vm_id),
  ]);

  return NextResponse.json({ ok: true });
}
