import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Entry point — route to the dashboard when signed in, otherwise to login.
export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/dashboard" : "/login");
}
