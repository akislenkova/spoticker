import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Shared-secret check for the eviction-telemetry collector endpoints.
 * Fails closed: if TELEMETRY_SECRET is unset, every request is rejected,
 * since these routes write with the service-role client.
 * Returns a response to send back, or null when the request is authorized.
 */
export function checkTelemetrySecret(req: NextRequest): NextResponse | null {
  const secret = process.env.TELEMETRY_SECRET;
  if (!secret) {
    console.error("telemetry: TELEMETRY_SECRET is not set; rejecting request");
    return NextResponse.json({ error: "telemetry not configured" }, { status: 503 });
  }

  const provided = Buffer.from(req.headers.get("x-telemetry-secret") ?? "");
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return null;
}
