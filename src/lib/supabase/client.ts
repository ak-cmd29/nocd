import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabasePublicEnv } from "./env";

export function createClient(): SupabaseClient<Database> {
  const { url, anonKey } = getSupabasePublicEnv();
  return createBrowserClient<Database>(url, anonKey);
}
