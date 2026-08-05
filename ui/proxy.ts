import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { withCheckpointApi } from "@kya-os/checkpoint-nextjs/api-middleware";

const checkAgent = withCheckpointApi({
  apiKey: process.env.CHECKPOINT_API_KEY!,
  skipPaths: ["/api/webhooks"],
  debug: process.env.NODE_ENV === "development",
});

// Paths that need Supabase auth session handling (see updateSession).
// /api/aws/config and /api/aws/cfn-template are public (handled in updateSession).
function needsAuthSession(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/connect" ||
    pathname.startsWith("/connect/") ||
    pathname.startsWith("/auth/") ||
    [
      "/api/aws/connect",
      "/api/aws/status",
      "/api/aws/sps",
      "/api/aws/disconnect",
      "/api/aws/config",
      "/api/aws/cfn-template",
    ].includes(pathname)
  );
}

export async function proxy(request: NextRequest) {
  const agentCheck = await checkAgent(request);
  if (agentCheck.status >= 400) return agentCheck;

  if (needsAuthSession(request.nextUrl.pathname)) {
    return updateSession(request);
  }

  return agentCheck;
}

// Checkpoint runs on nearly every route (agent detection); Supabase auth
// session refresh only runs on the auth-related subset (see needsAuthSession).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
