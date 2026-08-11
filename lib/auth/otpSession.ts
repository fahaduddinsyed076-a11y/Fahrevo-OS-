import { createHmac, timingSafeEqual } from "crypto";

// Server-only. Signs a small cookie proving a user has completed the full
// password + email-OTP flow, with an absolute 12-hour expiry baked into the
// signed payload itself — so the cap is enforced by whoever verifies the
// cookie (middleware, running server-side on every request), not by a
// client-side timer that could be tampered with or simply not run.

export const OTP_SESSION_COOKIE = "fahrevo_otp_session";
export const OTP_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60; // 12 hours

function secret(): string {
  const s = process.env.AUTH_SESSION_SECRET;
  if (!s) {
    throw new Error(
      "AUTH_SESSION_SECRET is not set. Set it in your environment (see .env.example) before using authentication.",
    );
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

// Builds the cookie value for a freshly-verified OTP session. The caller is
// responsible for actually setting the cookie (httpOnly, secure, sameSite).
export function createOtpSessionCookieValue(userId: string, nowMs: number = Date.now()): string {
  const expiresAtMs = nowMs + OTP_SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expiresAtMs}`;
  return `${payload}.${sign(payload)}`;
}

// Verifies a cookie value belongs to userId, is correctly signed, and has
// not passed its absolute 12-hour expiry. Never throws on malformed input —
// any problem simply means "not a valid OTP session".
export function isOtpSessionValid(cookieValue: string | undefined | null, userId: string): boolean {
  if (!cookieValue || !userId) return false;
  if (!process.env.AUTH_SESSION_SECRET) return false;

  const parts = cookieValue.split(".");
  if (parts.length !== 3) return false;
  const [uid, expStr, sig] = parts;
  if (uid !== userId) return false;

  const expected = sign(`${uid}.${expStr}`);
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return false;

  const expiresAtMs = Number(expStr);
  if (!Number.isFinite(expiresAtMs)) return false;
  if (Date.now() > expiresAtMs) return false;

  return true;
}
