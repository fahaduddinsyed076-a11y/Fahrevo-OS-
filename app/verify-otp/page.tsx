"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const RESEND_COOLDOWN_SECONDS = 60;

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export default function VerifyOtpPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const sentOnce = useRef(false);

  const sendCode = useCallback(async (addr: string, opts?: { silent?: boolean }) => {
    setSending(true);
    setError(null);
    if (!opts?.silent) setInfo(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setInfo(`A verification code was sent to ${maskEmail(addr)}.`);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError("Could not send a verification code right now. Please try again shortly.");
    } finally {
      setSending(false);
    }
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user?.email) {
        router.replace("/login");
        return;
      }
      setEmail(user.email);
      setCheckingSession(false);
      if (!sentOnce.current) {
        sentOnce.current = true;
        sendCode(user.email, { silent: false });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setError(null);
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
      if (error) throw error;

      const res = await fetch("/api/auth/otp-complete", { method: "POST" });
      if (!res.ok) throw new Error("otp-complete failed");

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Invalid or expired verification code.");
      setVerifying(false);
    }
  }

  async function onResend() {
    if (!email || cooldown > 0 || sending) return;
    await sendCode(email);
  }

  async function onBack() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-xl font-bold tracking-tight text-brand">Fahrevo OS</div>
        </div>

        <div className="mb-6">
          <h1 className="text-xl font-semibold text-neutral-900">Verify it&apos;s you</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Enter the 6-digit code sent to {email ? maskEmail(email) : "your email"}.
          </p>
        </div>

        <form onSubmit={onVerify} className="card space-y-4">
          <div>
            <label className="label" htmlFor="otp">Verification code</label>
            <input
              id="otp" inputMode="numeric" autoComplete="one-time-code" autoFocus
              maxLength={6}
              className="input text-center text-lg font-semibold tracking-[0.5em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="——————"
            />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {info && !error && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{info}</p>}

          <button type="submit" className="btn w-full" disabled={verifying || code.length !== 6}>
            {verifying ? "Verifying…" : "Verify & continue"}
          </button>

          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={onBack} className="font-medium text-neutral-500 hover:text-neutral-700">
              ← Back to sign in
            </button>
            <button
              type="button"
              onClick={onResend}
              disabled={cooldown > 0 || sending}
              className="font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:text-neutral-400 disabled:no-underline"
            >
              {sending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
