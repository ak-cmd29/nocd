import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { EvaluationError, evaluateAnswers, getEvaluationModel } from "@/lib/anthropic";
import { RECORDING_EXTENSIONS, RECORDINGS_BUCKET, recordingPath } from "@/lib/assessment/recordings";
import { getAuthContext } from "@/lib/auth";
import { TRANSCRIPTION_MODEL, TranscriptionError, transcribeAudioUrl } from "@/lib/groq";
import {
  flushLangfuse,
  startLangfuseSpan,
  withAttemptTrace,
} from "@/lib/langfuse";
import { createLogger, type Logger, type LogStep } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { REQUIRED_QUESTION_COUNT } from "@/lib/validation/knowledge-check";
import type { ApiErrorResponse, EvaluateProgressEvent, EvaluateRequest, EvaluateResponse } from "@/types";
import type { Database } from "@/types/database";

export const maxDuration = 120;

type AdminClient = SupabaseClient<Database>;
type ProgressStage = Extract<EvaluateProgressEvent["stage"], "transcribing" | "evaluating">;

class PipelineError extends Error {
  readonly step: LogStep;

  constructor(step: LogStep, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PipelineError";
    this.step = step;
  }
}

interface PipelineContext {
  admin: AdminClient;
  logger: Logger;
  checkId: string;
  attemptId: string;
  agentId: string;
  audioUrls: string[];
}

function errorResponse(status: number, error: string, details?: string[]): Response {
  const body: ApiErrorResponse = details ? { error, details } : { error };
  return Response.json(body, { status });
}

function parseEvaluateRequest(payload: unknown): { ok: true; value: EvaluateRequest } | { ok: false; error: string } {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const { checkId, attemptId, audioUrls } = payload as Record<string, unknown>;
  if (typeof checkId !== "string" || !isUuid(checkId)) {
    return { ok: false, error: '"checkId" must be a valid UUID.' };
  }
  if (typeof attemptId !== "string" || !isUuid(attemptId)) {
    return { ok: false, error: '"attemptId" must be a valid UUID.' };
  }
  if (
    !Array.isArray(audioUrls) ||
    audioUrls.length !== REQUIRED_QUESTION_COUNT ||
    !audioUrls.every((url): url is string => typeof url === "string")
  ) {
    return { ok: false, error: `"audioUrls" must be an array of exactly ${REQUIRED_QUESTION_COUNT} URLs.` };
  }
  return { ok: true, value: { checkId, attemptId, audioUrls } };
}

/** Returns the submitted URLs only if each one is this attempt's own storage path for that question. */
function verifiedRecordingUrls(admin: AdminClient, attemptId: string, audioUrls: string[]): string[] | null {
  const verified = audioUrls.map((url, index) => {
    const allowed = RECORDING_EXTENSIONS.map(
      (extension) =>
        admin.storage.from(RECORDINGS_BUCKET).getPublicUrl(recordingPath(attemptId, index, extension)).data.publicUrl,
    );
    return allowed.includes(url) ? url : null;
  });
  return verified.every((url): url is string => url !== null) ? verified : null;
}

async function transcribeAll(context: PipelineContext): Promise<string[]> {
  const { logger, attemptId, audioUrls } = context;

  return Promise.all(
    audioUrls.map(async (audioUrl, index) => {
      const question = index + 1;
      const startTime = new Date();
      const startedAt = performance.now();
      const span = startLangfuseSpan(
        `stt-q${question}`,
        {
          attempt_id: attemptId,
          model: TRANSCRIPTION_MODEL,
          question,
        },
        startTime,
      );
      logger.info("STT", `Transcribing question ${question}`, { question, model: TRANSCRIPTION_MODEL });

      try {
        const transcript = await transcribeAudioUrl(audioUrl);
        const latencyMs = Math.round(performance.now() - startedAt);
        logger.info("STT", `Transcribed question ${question}`, { question, latencyMs, characters: transcript.length });
        if (!transcript) {
          logger.warn("STT", `Transcript for question ${question} is empty`, { question });
        }
        span.update({
          output: { characters: transcript.length },
          metadata: {
            attempt_id: attemptId,
            model: TRANSCRIPTION_MODEL,
            latency_ms: latencyMs,
            characters: transcript.length,
          },
        });
        span.end();
        return transcript;
      } catch (error) {
        const latencyMs = Math.round(performance.now() - startedAt);
        logger.error("STT", `Transcription failed for question ${question}`, error, { question, latencyMs });
        span.update({
          level: "ERROR",
          statusMessage: error instanceof Error ? error.message : String(error),
          metadata: { attempt_id: attemptId, model: TRANSCRIPTION_MODEL, latency_ms: latencyMs },
        });
        span.end();
        const reason = error instanceof TranscriptionError ? error.message : "Unexpected transcription error.";
        throw new PipelineError("STT", `Transcription failed for question ${question}: ${reason}`, { cause: error });
      }
    }),
  );
}

async function runEvaluationPipeline(context: PipelineContext, onStage: (stage: ProgressStage) => void): Promise<void> {
  const { admin, logger, checkId, attemptId, audioUrls } = context;
  const pipelineStartedAt = performance.now();

  logger.info("DB", "Loading knowledge check", { checkId });
  const { data: check, error: checkError } = await admin
    .from("knowledge_checks")
    .select("reference_material, questions")
    .eq("id", checkId)
    .maybeSingle();
  if (checkError) {
    throw new PipelineError("DB", "Could not load the knowledge check.", { cause: checkError });
  }
  if (!check) {
    throw new PipelineError("DB", "The knowledge check no longer exists.");
  }
  if (check.questions.length !== REQUIRED_QUESTION_COUNT) {
    throw new PipelineError(
      "DB",
      `The knowledge check has ${check.questions.length} questions; expected ${REQUIRED_QUESTION_COUNT}.`,
    );
  }

  onStage("transcribing");
  const transcripts = await transcribeAll(context);

  logger.info("DB", "Saving transcripts");
  const { error: transcriptSaveError } = await admin
    .from("attempts")
    .update({ audio_urls: audioUrls, transcripts })
    .eq("id", attemptId);
  if (transcriptSaveError) {
    throw new PipelineError("DB", "Could not save transcripts.", { cause: transcriptSaveError });
  }

  onStage("evaluating");
  const model = getEvaluationModel();
  const evaluationStartedAt = performance.now();
  logger.info("EVAL", "Evaluating answers", { model });
  let evaluation;
  try {
    evaluation = await evaluateAnswers(check.reference_material, check.questions, transcripts, attemptId);
  } catch (error) {
    logger.error("EVAL", "Evaluation failed", error, { model });
    const reason = error instanceof EvaluationError ? error.message : "Unexpected evaluation error.";
    throw new PipelineError("EVAL", `Claude could not evaluate the answers: ${reason}`, { cause: error });
  }
  logger.info("EVAL", "Evaluation complete", {
    model,
    latencyMs: Math.round(performance.now() - evaluationStartedAt),
    scores: evaluation.map((result) => result.score),
    reassuranceViolations: evaluation.filter((result) => result.reassurance_violation).length,
  });

  logger.info("DB", "Saving evaluation");
  const { error: evaluationSaveError } = await admin
    .from("attempts")
    .update({ evaluation, status: "completed" })
    .eq("id", attemptId);
  if (evaluationSaveError) {
    throw new PipelineError("DB", "Could not save the evaluation.", { cause: evaluationSaveError });
  }

  logger.info("API", "Pipeline completed", { totalLatencyMs: Math.round(performance.now() - pipelineStartedAt) });
}

async function runTracedEvaluationPipeline(
  context: PipelineContext,
  onStage: (stage: ProgressStage) => void,
): Promise<void> {
  const traceMetadata = { attempt_id: context.attemptId, check_id: context.checkId, agent_id: context.agentId };
  return withAttemptTrace(
    { attemptId: context.attemptId, checkId: context.checkId, agentId: context.agentId },
    { check_id: context.checkId, recording_count: context.audioUrls.length },
    async (trace) => {
      try {
        await runEvaluationPipeline(context, onStage);
        trace.update({ output: { status: "completed" }, metadata: traceMetadata });
      } catch (error) {
        trace.update({
          level: "ERROR",
          statusMessage: error instanceof Error ? error.message : String(error),
          output: { status: "failed" },
          metadata: traceMetadata,
        });
        throw error;
      }
    },
  );
}

async function recordFailure(context: PipelineContext, error: unknown): Promise<PipelineError> {
  const failure =
    error instanceof PipelineError
      ? error
      : new PipelineError("API", "Unexpected error while processing the assessment.", { cause: error });
  context.logger.error(failure.step, `Pipeline failed: ${failure.message}`, error);

  const { error: statusError } = await context.admin
    .from("attempts")
    .update({ status: "failed" })
    .eq("id", context.attemptId);
  if (statusError) {
    context.logger.error("DB", "Could not mark attempt as failed", statusError);
  }
  return failure;
}

function streamPipeline(context: PipelineContext): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: EvaluateProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          context.logger.warn("API", "Client disconnected before progress event was delivered", { stage: event.stage });
        }
      };

      try {
        await runTracedEvaluationPipeline(context, (stage) => send({ stage }));
        send({ stage: "completed", attemptId: context.attemptId });
      } catch (error) {
        const failure = await recordFailure(context, error);
        send({ stage: "failed", error: failure.message });
      } finally {
        try {
          controller.close();
        } catch {
          context.logger.warn("API", "Progress stream was already closed");
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const auth = await getAuthContext(supabase);
  if (!auth) {
    return errorResponse(401, "You must be signed in to submit an assessment.");
  }
  if (auth.role !== "agent") {
    return errorResponse(403, "Only intake advocates can submit assessments.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }
  const parsed = parseEvaluateRequest(payload);
  if (!parsed.ok) {
    return errorResponse(422, parsed.error);
  }
  const { checkId, attemptId, audioUrls } = parsed.value;
  const logger = createLogger({ attemptId });

  let admin: AdminClient;
  try {
    admin = createAdminClient();
  } catch (error) {
    logger.error("API", "Service-role client unavailable", error);
    return errorResponse(500, "The evaluation service is misconfigured. Contact an administrator.");
  }

  const { data: attempt, error: attemptError } = await admin
    .from("attempts")
    .select("agent_id, check_id, status")
    .eq("id", attemptId)
    .maybeSingle();
  if (attemptError) {
    logger.error("DB", "Could not load attempt", attemptError);
    return errorResponse(500, "Could not load your attempt. Please try again.");
  }
  if (!attempt || attempt.agent_id !== auth.userId || attempt.check_id !== checkId) {
    return errorResponse(404, "Attempt not found.");
  }
  if (attempt.status !== "processing") {
    return errorResponse(409, `This attempt has already been ${attempt.status === "completed" ? "evaluated" : "closed"}.`);
  }

  const verifiedUrls = verifiedRecordingUrls(admin, attemptId, audioUrls);
  if (!verifiedUrls) {
    logger.warn("API", "Rejected audio URLs that do not match the attempt's storage paths");
    return errorResponse(422, "Audio URLs do not match this attempt's recordings.");
  }

  logger.info("API", "Evaluation started", { checkId, agentId: auth.userId });
  after(() => flushLangfuse(attemptId));

  const context: PipelineContext = {
    admin,
    logger,
    checkId,
    attemptId,
    agentId: auth.userId,
    audioUrls: verifiedUrls,
  };

  if (request.headers.get("accept")?.includes("application/x-ndjson")) {
    return streamPipeline(context);
  }

  try {
    await runTracedEvaluationPipeline(context, () => undefined);
  } catch (error) {
    const failure = await recordFailure(context, error);
    return errorResponse(500, failure.message, [`Failed step: [${failure.step}]`, `Attempt ID: ${attemptId}`]);
  }

  const body: EvaluateResponse = { attemptId };
  return Response.json(body);
}
