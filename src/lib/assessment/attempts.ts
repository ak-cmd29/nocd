import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttemptStatus } from "@/types";
import type { Database } from "@/types/database";

export const MAX_ATTEMPTS_PER_CHECK = 3;

/**
 * The evaluation route times out after 120 s, so an attempt still "processing" after this
 * window was abandoned (closed tab, lost connection) and must not consume one of the agent's attempts.
 * Mirrored by public.count_used_attempts() in supabase/schema.sql.
 */
export const STALE_PROCESSING_MS = 10 * 60 * 1000;

export function isStaleProcessing(status: AttemptStatus, createdAt: string, now: number): boolean {
  return status === "processing" && now - new Date(createdAt).getTime() > STALE_PROCESSING_MS;
}

/** Failed and abandoned attempts are pipeline problems, not the agent's fault, so they don't count. */
export function countsTowardLimit(status: AttemptStatus, createdAt: string, now: number): boolean {
  return status === "completed" || (status === "processing" && !isStaleProcessing(status, createdAt, now));
}

/** Reports abandoned "processing" attempts as failed so they never look stuck. */
export function effectiveStatus(status: AttemptStatus, createdAt: string): AttemptStatus {
  return isStaleProcessing(status, createdAt, Date.now()) ? "failed" : status;
}

export function usedAttemptsByCheck(
  attempts: readonly { check_id: string; status: AttemptStatus; created_at: string }[],
): Map<string, number> {
  const now = Date.now();
  const used = new Map<string, number>();
  for (const attempt of attempts) {
    if (countsTowardLimit(attempt.status, attempt.created_at, now)) {
      used.set(attempt.check_id, (used.get(attempt.check_id) ?? 0) + 1);
    }
  }
  return used;
}

export async function countUsedAttempts(
  supabase: SupabaseClient<Database>,
  agentId: string,
  checkId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("attempts")
    .select("status, created_at")
    .eq("agent_id", agentId)
    .eq("check_id", checkId)
    .in("status", ["processing", "completed"]);
  if (error) throw new Error(`Failed to count attempts: ${error.message}`);
  const now = Date.now();
  return data.filter((attempt) => countsTowardLimit(attempt.status, attempt.created_at, now)).length;
}
