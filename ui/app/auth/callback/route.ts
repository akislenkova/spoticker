import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function safeNextPath(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

function loginRedirect(origin: string, reason: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", "auth");
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url.toString());
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNextPath(searchParams.get("next"));

  const oauthError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (oauthError) {
    console.error("auth callback oauth error", oauthError);
    return loginRedirect(origin, "oauth");
  }

  const redirectResponse = NextResponse.redirect(`${origin}${next}`);
  redirectResponse.headers.set("Cache-Control", "private, no-store");

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) =>
          redirectResponse.cookies.set(name, value, options)
        );
        if (headers) {
          Object.entries(headers).forEach(([key, value]) =>
            redirectResponse.headers.set(key, value)
          );
        }
      },
    },
  });

  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("auth callback exchangeCodeForSession", error.message);

      // PKCE needs the code-verifier cookie from the browser that requested the link.
      if (token_hash && type) {
        const { error: otpErr } = await supabase.auth.verifyOtp({
          type,
          token_hash,
        });
        if (!otpErr) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) return redirectResponse;
        }
      }

      const reason =
        /verifier|code challenge|invalid flow/i.test(error.message)
          ? "different_browser"
          : "exchange";
      return loginRedirect(origin, reason);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.error("auth callback: exchange succeeded but no user");
      return loginRedirect(origin, "no_user");
    }
    return redirectResponse;
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) {
      console.error("auth callback verifyOtp", error.message);
      return loginRedirect(origin, "otp");
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return loginRedirect(origin, "no_user");
    return redirectResponse;
  }

  return loginRedirect(origin, "missing");
}
