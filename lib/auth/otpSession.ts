// Server-only. Signs a small cookie proving a user has completed the full
// password + email-OTP flow, with an absolute 12-hour expiry baked into the
// signed payload itself — so the cap is enforced by whoever verifies the
// cookie (middleware, running server-side on every request), not by a
// client-side timer that could be tampered with or simply not run.
//
// Uses the Web Crypto API (globalThis.crypto.subtle) rather than Node's
// `crypto` module: this file is imported (via lib/supabase/middleware.ts)
// into the root middleware.ts, which Next.js runs on the Edge Runtime —
// Node's `crypto` module is not available there. Web Crypto works in both
// the Edge Runtime and Node.js server components/route handlers.

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

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function sign(payload: string): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(sig);
}

// Builds the cookie value for a freshly-verified OTP session. The caller is
// responsible for actually setting the cookie (httpOnly, secure, sameSite).
export async function createOtpSessionCookieValue(userId: string, nowMs: number = Date.now()): Promise<string> {
  const expiresAtMs = nowMs + OTP_SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expiresAtMs}`;
  return `${payload}.${await sign(payload)}`;
}

// Verifies a cookie value belongs to userId, is correctly signed, and has
// not passed its absolute 12-hour expiry. Never throws on malformed input —
// any problem simply means "not a valid OTP session".
export async function isOtpSessionValid(cookieValue: string | undefined | null, userId: string): Promise<boolean> {
  if (!cookieValue || !userId) return false;
  if (!process.env.AUTH_SESSION_SECRET) return false;

  const parts = cookieValue.split(".");
  if (parts.length !== 3) return false;
  const [uid, expStr, sig] = parts;
  if (uid !== userId) return false;

  const key = await hmacKey();
  const sigBytes = fromHex(sig);
  if (!sigBytes) return false;
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes as BufferSource,
    new TextEncoder().encode(`${uid}.${expStr}`),
  );
  if (!valid) return false;

  const expiresAtMs = Number(expStr);
  if (!Number.isFinite(expiresAtMs)) return false;
  if (Date.now() > expiresAtMs) return false;

  return true;
}
