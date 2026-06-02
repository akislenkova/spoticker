import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
        if (headers) {
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          );
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/login") || path.startsWith("/auth/");
  // Public AWS routes (no session required) - see route comments
  const isPublicAwsApi =
    path === "/api/aws/config" || path === "/api/aws/cfn-template";
  const isProtected = path.startsWith("/api/aws/") && !isPublicAwsApi;

  if (!user && isProtected && !isAuthRoute) {
    const connectUrl = request.nextUrl.clone();
    connectUrl.pathname = "/connect";
    return NextResponse.redirect(connectUrl);
  }

  if (path === "/login") {
    const connectUrl = request.nextUrl.clone();
    connectUrl.pathname = "/connect";
    return NextResponse.redirect(connectUrl);
  }

  supabaseResponse.headers.set("Cache-Control", "private, no-store");
  return supabaseResponse;
}
