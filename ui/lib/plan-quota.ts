import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getLatestConnectedForUser } from "@/lib/aws-db";

/** Free-tier Plan Mode analyses per UTC day, per verified AWS account. */
export const FREE_PLAN_DAILY_LIMIT = 3;
/** Analyses per UTC day for visitors without a connected AWS account, per IP. */
export const ANON_PLAN_DAILY_LIMIT = 1;

export type QuotaSubject = { key: string; limit: number; connected: boolean };
export type QuotaResult = { allowed: boolean; used: number; limit: number };

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Who the quota is charged to. Supabase users are anonymous and free to mint,
 * so the unit is the AWS account the server verified via AssumeRole, or the
 * caller's IP when there is no connected account.
 */
export async function resolveQuotaSubject(req: NextRequest): Promise<QuotaSubject> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const conn = await getLatestConnectedForUser(user.id);
    if (conn?.account_id) {
      return { key: `aws:${conn.account_id}`, limit: FREE_PLAN_DAILY_LIMIT, connected: true };
    }
  }
  return { key: `ip:${clientIp(req)}`, limit: ANON_PLAN_DAILY_LIMIT, connected: false };
}

/** Atomically takes one analysis from today's quota (see consume_plan_quota). */
export async function consumePlanQuota(subject: QuotaSubject): Promise<QuotaResult> {
  const { data, error } = await getSupabaseAdmin()
    .rpc("consume_plan_quota", { p_subject: subject.key, p_limit: subject.limit })
    .single<{ allowed: boolean; used: number }>();

  if (error) throw error;
  return { allowed: data.allowed, used: data.used, limit: subject.limit };
}

/** Returns one analysis to today's quota after a failure on our side. */
export async function refundPlanQuota(subject: QuotaSubject) {
  const { error } = await getSupabaseAdmin().rpc("refund_plan_quota", {
    p_subject: subject.key,
  });
  if (error) console.error("refund_plan_quota failed", { subject: subject.key, message: error.message });
}

/** Seconds until the quota resets at the next UTC midnight. */
export function secondsUntilQuotaReset(now = new Date()): number {
  const reset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.ceil((reset - now.getTime()) / 1000);
}
