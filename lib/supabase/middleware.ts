import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import { OTP_SESSION_COOKIE, isOtpSessionValid } from "@/lib/auth/otpSession";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Refreshes the auth session on every request and guards protected routes.
// Access requires BOTH a valid Supabase session (password verified) AND an
// unexpired, signed OTP-session cookie (email OTP verified, capped at an
// absolute 12 hours from when it was issued — see lib/auth/otpSession.ts).
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isNextInternal = path.startsWith("/_next");
  // Routes that are part of completing/leaving the auth flow itself — signout
  // and the OTP-completion endpoint must be reachable regardless of OTP state.
  const isAuthAction = path.startsWith("/auth") || path.startsWith("/api/auth");
  const isLoginPage = path === "/login";
  const isVerifyOtpPage = path === "/verify-otp";

  // No Supabase session at all -> only login / auth actions / static assets.
  if (!user) {
    if (isLoginPage || isAuthAction || isNextInternal) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const otpCookie = request.cookies.get(OTP_SESSION_COOKIE)?.value;
  const otpValid = await isOtpSessionValid(otpCookie, user.id);

  if (isLoginPage) {
    // Already password-authenticated -> skip straight past login.
    const url = request.nextUrl.clone();
    url.pathname = otpValid ? "/dashboard" : "/verify-otp";
    return NextResponse.redirect(url);
  }

  if (isVerifyOtpPage || isAuthAction || isNextInternal) {
    return response;
  }

  if (!otpValid) {
    // Password step is done but OTP is missing/expired — including the
    // absolute 12-hour cap being reached. Force a full re-authentication
    // rather than silently extending or partially trusting the session.
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirectResponse = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    redirectResponse.cookies.delete(OTP_SESSION_COOKIE);
    return redirectResponse;
  }

  return response;
}
