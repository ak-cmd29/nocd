"use server";

import { countUsedAttempts, MAX_ATTEMPTS_PER_CHECK } from "@/lib/assessment/attempts";
import { getCheckForAgent } from "@/lib/assessment/checks";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

export type StartAttemptResult = { ok: true; attemptId: string } | { ok: false; error: string };

export async function startAttempt(checkId: string): Promise<StartAttemptResult> {
  if (!isUuid(checkId)) {
    return { ok: false, error: "This knowledge check link is invalid." };
  }

  const supabase = await createClient();
  const auth = await getAuthContext(supabase);
  if (!auth) {
    return { ok: false, error: "Your session expired. Sign in again to submit." };
  }
  if (auth.role !== "agent") {
    return { ok: false, error: "Only intake advocates can submit assessments." };
  }

  let usedAttempts: number;
  try {
    const check = await getCheckForAgent(checkId);
    if (!check) {
      return { ok: false, error: "This knowledge check is no longer available." };
    }
    usedAttempts = await countUsedAttempts(supabase, auth.userId, checkId);
  } catch (loadError) {
    console.error(loadError);
    return { ok: false, error: "Could not start your submission. Please try again." };
  }
  if (usedAttempts >= MAX_ATTEMPTS_PER_CHECK) {
    return {
      ok: false,
      error: `You've used all ${MAX_ATTEMPTS_PER_CHECK} attempts for this knowledge check.`,
    };
  }

  const { data: attempt, error: insertError } = await supabase
    .from("attempts")
    .insert({ check_id: checkId, agent_id: auth.userId, status: "processing" })
    .select("id")
    .single();
  if (insertError || !attempt) {
    console.error("Failed to create attempt", insertError);
    return { ok: false, error: "Could not start your submission. Please try again." };
  }

  return { ok: true, attemptId: attempt.id };
}
