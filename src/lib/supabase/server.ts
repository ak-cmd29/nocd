import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "@/types/database";
import { getSupabasePublicEnv } from "./env";

export async function createClient(): Promise<SupabaseClient<Database>> {
  // With partial prefetching, cookies() resolves during prerendering; Supabase auth reads
  // Date.now() to check session expiry, so the client must only run at request time.
  await connection();
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; session refresh happens in src/proxy.ts.
        }
      },
    },
  });
}
