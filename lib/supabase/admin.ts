import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
/** Server-only account tooling and scoped private Storage signing. Tenant SQL always uses RLS RPCs. */
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Admin credentials are not configured");
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
