import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Only run auth on routes that need it — avoids Supabase round-trips on every matrix refresh.
// /api/aws/config and /api/aws/cfn-template are public (handled in updateSession).
export const config = {
  matcher: [
    "/",
    "/connect",
    "/connect/:path*",
    "/login",
    "/auth/:path*",
    "/api/aws/connect",
    "/api/aws/status",
    "/api/aws/sps",
    "/api/aws/disconnect",
    "/api/aws/config",
    "/api/aws/cfn-template",
  ],
};
