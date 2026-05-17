import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type AwsConnectionRow = {
  id: string;
  user_id: string;
  external_id: string;
  role_arn: string | null;
  account_id: string | null;
  status: string;
  error: string | null;
  connected_at: string | null;
  created_at: string;
};

/** Server-side DB access with explicit user_id checks (works with RLS on or off). */
export async function createPendingConnection(userId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("aws_connections")
    .insert({ user_id: userId })
    .select("id, external_id")
    .single();

  if (error) throw error;
  return data;
}

export async function getConnectionForUser(userId: string, connectionId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("aws_connections")
    .select("id, user_id, external_id, role_arn, account_id, status, error, connected_at")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .single();

  if (error) return null;
  return data;
}

export async function getLatestConnectedForUser(userId: string) {
  const { data } = await getSupabaseAdmin()
    .from("aws_connections")
    .select("id, account_id, connected_at, status")
    .eq("user_id", userId)
    .eq("status", "connected")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

export async function getLatestErrorForUser(userId: string) {
  const { data } = await getSupabaseAdmin()
    .from("aws_connections")
    .select("error")
    .eq("user_id", userId)
    .eq("status", "error")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.error ?? null;
}

export async function markConnectionConnected(
  userId: string,
  connectionId: string,
  roleArn: string,
  accountId: string
) {
  const { error } = await getSupabaseAdmin()
    .from("aws_connections")
    .update({
      role_arn: roleArn,
      account_id: accountId,
      status: "connected",
      connected_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", connectionId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function markConnectionError(
  userId: string,
  connectionId: string,
  message: string
) {
  await getSupabaseAdmin()
    .from("aws_connections")
    .update({ status: "error", error: message })
    .eq("id", connectionId)
    .eq("user_id", userId);
}
