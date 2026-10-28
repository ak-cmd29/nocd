"use server";

import { redirect } from "next/navigation";
import { getAuthContext, homePathForRole, sanitizeRedirectPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface SignInState {
  error: string | null;
}

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const next = formData.get("next");

  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    return { error: "Invalid email or password." };
  }

  const auth = await getAuthContext(supabase);
  if (!auth) {
    await supabase.auth.signOut();
    return { error: "Your account does not have a role assigned. Contact your Intake Ops manager." };
  }

  const home = homePathForRole(auth.role);
  const requested = sanitizeRedirectPath(typeof next === "string" ? next : null);
  redirect(requested && requested.startsWith(home) ? requested : home);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
