// Public Supabase connection values. The publishable (anon) key is safe to
// expose in the browser; RLS restricts data access to authenticated users.
// These fall back to the project defaults so the app works even if the Vercel
// environment variables are not set, but setting them is still recommended.

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://csutesdytvepazfmwvnk.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_pzh1CeyHX0OilgFVE7A4kg_NtisLjC7";
