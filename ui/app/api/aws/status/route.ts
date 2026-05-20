import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AWS_CONNECTION_COOKIE, connectionCookieOptions } from "@/lib/aws-security";
import { getAuthenticatedSupabase } from "@/lib/aws-api";
import { isSpottickerAwsConfigured } from "@/lib/aws-credentials";
import {
  getConnectionForUser,
  getLatestConnectedForUser,
  getLatestErrorForUser,
} from "@/lib/aws-db";

// GET /api/aws/status — whether the signed-in user has an active AWS connection

export async function GET() {
  const auth = await getAuthenticatedSupabase();
  if (auth.response) return auth.response;
  const { user } = auth;

  const cookieStore = await cookies();
  let connectionId = cookieStore.get(AWS_CONNECTION_COOKIE)?.value;

  let conn =
    connectionId != null
      ? await getConnectionForUser(user.id, connectionId)
      : null;

  if (!conn || conn.status !== "connected") {
    const latest = await getLatestConnectedForUser(user.id);
    if (latest?.status === "connected") {
      conn = await getConnectionForUser(user.id, latest.id);
      connectionId = latest.id;
    }
  }

  if (!conn || conn.status !== "connected") {
    const lastError = await getLatestErrorForUser(user.id);
    return NextResponse.json({
      authenticated: true,
      email: user.email,
      connected: false,
      serverConfigured: isSpottickerAwsConfigured(),
      lastError,
    });
  }

  const response = NextResponse.json({
    authenticated: true,
    email: user.email,
    connected: true,
    connectionId: conn.id,
    accountId: conn.account_id,
    connectedAt: conn.connected_at,
    serverConfigured: isSpottickerAwsConfigured(),
  });

  if (connectionId && cookieStore.get(AWS_CONNECTION_COOKIE)?.value !== connectionId) {
    response.cookies.set(AWS_CONNECTION_COOKIE, connectionId, connectionCookieOptions());
  }

  return response;
}
