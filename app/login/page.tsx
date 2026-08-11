"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function EyeIcon({ off }: { off: boolean }) {
  if (off) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Password verified — the account is not fully signed in until the
      // OTP step also succeeds (enforced server-side in middleware).
      router.push("/verify-otp");
      router.refresh();
    } catch {
      // Generic on purpose — never reveal whether the email or password was wrong.
      setError("Invalid email or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — desktop only */}
      <div className="relative hidden overflow-hidden bg-brand-dark lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, rgba(255,255,255,0.12), transparent 45%), radial-gradient(circle at 85% 80%, rgba(255,255,255,0.10), transparent 40%)",
          }}
        />
        <div className="relative">
          <div className="text-2xl font-bold tracking-tight text-white">Fahrevo OS</div>
        </div>
        <div className="relative max-w-sm">
          <p className="text-xl font-semibold leading-snug text-white">
            Business &amp; financial control for cloud kitchens.
          </p>
          <p className="mt-3 text-sm text-white/70">
            Sales, inventory, purchases and P&amp;L — one deterministic system, built on real transaction data.
          </p>
        </div>
        <div className="relative text-xs text-white/50">Secure owner access · two-factor verified</div>
      </div>

      {/* Sign-in panel */}
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="text-xl font-bold tracking-tight text-brand">Fahrevo OS</div>
            <p className="mt-1 text-sm text-neutral-500">Business &amp; financial control</p>
          </div>

          <div className="mb-6">
            <h1 className="text-xl font-semibold text-neutral-900">Sign in</h1>
            <p className="mt-1 text-sm text-neutral-500">Enter your credentials to continue.</p>
          </div>

          <form onSubmit={onSubmit} className="card space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email" type="email" required autoComplete="email" autoFocus
                className="input" value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password" type={showPassword ? "text" : "password"} required minLength={6}
                  autoComplete="current-password"
                  className="input pr-10" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 hover:text-neutral-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button type="submit" className="btn w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-neutral-400">
            A verification code will be sent to your email after sign-in.
          </p>
        </div>
      </div>
    </main>
  );
}
