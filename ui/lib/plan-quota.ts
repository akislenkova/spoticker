import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Free-tier Plan Mode analyses per UTC day. */
export const FREE_PLAN_DAILY_LIMIT = 3;

export type QuotaResult = { allowed: boolean; used: number; limit: number };

/** Atomically takes one analysis from today's quota (see consume_plan_quota). */
export async function consumePlanQuota(
  userId: string,
  limit = FREE_PLAN_DAILY_LIMIT
): Promise<QuotaResult> {
  const { data, error } = await getSupabaseAdmin()
    .rpc("consume_plan_quota", { p_user_id: userId, p_limit: limit })
    .single<{ allowed: boolean; used: number }>();

  if (error) throw error;
  return { allowed: data.allowed, used: data.used, limit };
}

/** Returns one analysis to today's quota after a failure on our side. */
export async function refundPlanQuota(userId: string) {
  const { error } = await getSupabaseAdmin().rpc("refund_plan_quota", {
    p_user_id: userId,
  });
  if (error) console.error("refund_plan_quota failed", { userId, message: error.message });
}

/** Seconds until the quota resets at the next UTC midnight. */
export function secondsUntilQuotaReset(now = new Date()): number {
  const reset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.ceil((reset - now.getTime()) / 1000);
}
