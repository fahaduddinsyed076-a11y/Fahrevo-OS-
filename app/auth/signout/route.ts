import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OTP_SESSION_COOKIE } from "@/lib/auth/otpSession";

export async function POST(request: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.cookies.delete(OTP_SESSION_COOKIE);
  return response;
}
