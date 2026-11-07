"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";
/** Optional browser SDK for future auth UI. Current app uses HttpOnly server sessions. */
export function browserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
