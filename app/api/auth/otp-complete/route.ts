import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createOtpSessionCookieValue, OTP_SESSION_COOKIE, OTP_SESSION_MAX_AGE_SECONDS } from "@/lib/auth/otpSession";

// Called by the client immediately after supabase.auth.verifyOtp() succeeds.
// Marks this browser as having completed the full password + OTP flow by
// setting a signed, httpOnly cookie with an absolute 12-hour expiry. This is
// re-verified server-side on every request (see lib/supabase/middleware.ts),
// not trusted from the client.
export async function POST() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(OTP_SESSION_COOKIE, createOtpSessionCookieValue(user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OTP_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
