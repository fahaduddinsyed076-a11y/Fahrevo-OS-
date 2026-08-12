import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { OTP_SESSION_COOKIE, isOtpSessionValid } from "@/lib/auth/otpSession";
import AppShell from "@/components/AppShell";

// Protected layout: every route in this group requires an authenticated user
// AND a completed, unexpired OTP session. This mirrors the check already
// enforced in middleware.ts — kept here too as defense-in-depth so this
// layout never renders business data without both checks passing.
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const otpCookie = cookies().get(OTP_SESSION_COOKIE)?.value;
  if (!(await isOtpSessionValid(otpCookie, user.id))) redirect("/login");

  return <AppShell email={user.email ?? "Signed in"}>{children}</AppShell>;
}
