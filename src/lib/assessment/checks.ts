import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentQuestion, Question } from "@/types";

/**
 * Agents cannot read knowledge_checks rows under RLS, because rows carry grading criteria and
 * sample answers. These loaders run with the service role on the server and return only the
 * fields an agent is allowed to see; callers must authorize the agent first.
 */

export interface AgentCheckSummary {
  id: string;
  topic: string;
  created_at: string;
}

export interface AgentCheck {
  id: string;
  topic: string;
  questions: AgentQuestion[];
}

export interface CheckForResults {
  id: string;
  topic: string;
  questions: Question[];
}

export async function listChecksForAgent(): Promise<AgentCheckSummary[]> {
  const { data, error } = await createAdminClient()
    .from("knowledge_checks")
    .select("id, topic, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list knowledge checks: ${error.message}`);
  return data;
}

export async function getCheckForAgent(checkId: string): Promise<AgentCheck | null> {
  const { data, error } = await createAdminClient()
    .from("knowledge_checks")
    .select("id, topic, questions")
    .eq("id", checkId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load knowledge check: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    topic: data.topic,
    questions: data.questions.map(({ id, prompt }) => ({ id, prompt })),
  };
}

/** Includes criteria; only call after verifying the viewer may see this attempt's results. */
export async function getCheckForResults(checkId: string): Promise<CheckForResults | null> {
  const { data, error } = await createAdminClient()
    .from("knowledge_checks")
    .select("id, topic, questions")
    .eq("id", checkId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load knowledge check: ${error.message}`);
  return data;
}
