import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getAuthContext, homePathForRole, type AuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { UserRole } from "@/types";

interface RoleGuardResult {
  supabase: SupabaseClient<Database>;
  auth: AuthContext;
}

export async function requireRole(
  allowed: UserRole | readonly UserRole[],
  currentPath: string,
): Promise<RoleGuardResult> {
  const supabase = await createClient();
  const auth = await getAuthContext(supabase);

  if (!auth) {
    redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  }
  const allowedRoles: readonly UserRole[] = typeof allowed === "string" ? [allowed] : allowed;
  if (!allowedRoles.includes(auth.role)) {
    redirect(homePathForRole(auth.role));
  }

  return { supabase, auth };
}
