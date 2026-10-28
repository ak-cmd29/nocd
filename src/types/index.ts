export type UserRole = "manager" | "agent";

export interface Question {
  id: string;
  prompt: string;
  criteria: string;
  sample_good_response?: string;
}

export interface KnowledgeCheck {
  id: string;
  topic: string;
  reference_material: string;
  questions: Question[];
  created_at: string;
}

export type KnowledgeCheckInput = Pick<KnowledgeCheck, "topic" | "reference_material" | "questions">;

export interface KnowledgeCheckSummary {
  id: string;
  topic: string;
  question_count: number;
  created_at: string;
}

export interface CreateCheckResponse {
  id: string;
}

export interface DeleteCheckResponse {
  id: string;
  deletedAttempts: number;
}

export interface ApiErrorResponse {
  error: string;
  details?: string[];
}

export type AgentQuestion = Pick<Question, "id" | "prompt">;

export interface EvaluateRequest {
  checkId: string;
  attemptId: string;
  audioUrls: string[];
}

export interface EvaluateResponse {
  attemptId: string;
}

export type EvaluateProgressEvent =
  | { stage: "transcribing" }
  | { stage: "evaluating" }
  | { stage: "completed"; attemptId: string }
  | { stage: "failed"; error: string };

export type EvaluationScore = "pass" | "needs_review" | "fail";

export interface EvaluationResult {
  question_id: string;
  transcript: string;
  score: EvaluationScore;
  concepts_identified: string[];
  critical_omissions: string[];
  reassurance_violation: boolean;
  actionable_feedback: string;
}

export type AttemptStatus = "processing" | "completed" | "failed";

export interface Attempt {
  id: string;
  check_id: string;
  agent_id: string;
  audio_urls: string[];
  transcripts: string[];
  evaluation: EvaluationResult[];
  status: AttemptStatus;
  created_at: string;
}
