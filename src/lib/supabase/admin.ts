import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabasePublicEnv } from "./env";

export function createAdminClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error("The Supabase service-role client must never be created in the browser.");
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
  }
  const { url } = getSupabasePublicEnv();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
