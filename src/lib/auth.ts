import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { UserRole } from "@/types";

export interface AuthContext {
  userId: string;
  email: string;
  role: UserRole;
}

function isUserRole(value: unknown): value is UserRole {
  return value === "manager" || value === "agent";
}

export async function getAuthContext(supabase: SupabaseClient<Database>): Promise<AuthContext | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email, role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile || !isUserRole(profile.role)) return null;

  return { userId: user.id, email: profile.email, role: profile.role };
}

export function homePathForRole(role: UserRole): string {
  return role === "manager" ? "/manager" : "/agent";
}

export function sanitizeRedirectPath(candidate: string | null | undefined): string | null {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\")) {
    return null;
  }
  return candidate;
}
