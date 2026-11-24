import { NextRequest, NextResponse } from "next/server";
import {
  consumePlanQuota,
  refundPlanQuota,
  resolveQuotaSubject,
  FREE_PLAN_DAILY_LIMIT,
  secondsUntilQuotaReset,
} from "@/lib/plan-quota";

const PLAN_SERVICE_URL = process.env.PLAN_SERVICE_URL ?? "http://localhost:8001";
const PLAN_SERVICE_SECRET = process.env.PLAN_SERVICE_SECRET;

// Each analysis runs up to two Claude calls, so it counts against a daily
// quota charged to the caller's connected AWS account, or to their IP.
export async function POST(req: NextRequest) {
  if (!PLAN_SERVICE_SECRET && process.env.NODE_ENV === "production") {
    console.error("/api/plan: PLAN_SERVICE_SECRET is not set; refusing to call plan service");
    return NextResponse.json({ error: "Plan service is not configured." }, { status: 503 });
  }

  let subject;
  let quota;
  try {
    subject = await resolveQuotaSubject(req);
    quota = await consumePlanQuota(subject);
  } catch (err) {
    console.error("/api/plan quota check failed", err);
    return NextResponse.json({ error: "Could not check usage limit." }, { status: 503 });
  }
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: subject.connected
          ? `Free plan limit reached: ${quota.limit} analyses per day. Resets at 00:00 UTC.`
          : `Free limit reached: ${quota.limit} analysis per day without an AWS account. Connect AWS at /connect for ${FREE_PLAN_DAILY_LIMIT} per day.`,
        used: quota.used,
        limit: quota.limit,
        connected: subject.connected,
      },
      { status: 429, headers: { "Retry-After": String(secondsUntilQuotaReset()) } }
    );
  }

  const form = await req.formData();

  const headers: Record<string, string> = {};
  if (PLAN_SERVICE_SECRET) {
    headers["Authorization"] = `Bearer ${PLAN_SERVICE_SECRET}`;
  }

  try {
    const upstream = await fetch(`${PLAN_SERVICE_URL}/analyze`, {
      method: "POST",
      headers,
      body: form,
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      await refundPlanQuota(subject);
      return NextResponse.json(
        { error: data.detail ?? "Plan service error." },
        { status: upstream.status }
      );
    }

    return NextResponse.json({ ...data, usage: { used: quota.used, limit: quota.limit } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/plan error", message);
    await refundPlanQuota(subject);
    return NextResponse.json(
      { error: `Plan service unreachable: ${message}` },
      { status: 503 }
    );
  }
}
