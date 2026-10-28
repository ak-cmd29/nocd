import {
  createTraceId,
  propagateAttributes,
  startActiveObservation,
  startObservation,
  type LangfuseGeneration,
  type LangfuseGenerationAttributes,
  type LangfuseSpan,
} from "@langfuse/tracing";
import { TraceFlags, type SpanContext } from "@opentelemetry/api";
import { langfuseSpanProcessor } from "@/instrumentation";
import { createLogger, serializeError } from "@/lib/logger";

export function isLangfuseEnabled(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY &&
      process.env.LANGFUSE_SECRET_KEY &&
      langfuseSpanProcessor,
  );
}

function randomSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface AttemptTraceContext {
  attemptId: string;
  checkId: string;
  agentId: string;
}

export async function withAttemptTrace<T>(
  { attemptId, checkId, agentId }: AttemptTraceContext,
  input: Record<string, unknown>,
  callback: (trace: LangfuseSpan) => Promise<T>,
): Promise<T> {
  const parentSpanContext: SpanContext = {
    traceId: await createTraceId(attemptId),
    spanId: randomSpanId(),
    traceFlags: TraceFlags.SAMPLED,
    isRemote: true,
  };

  return startActiveObservation(
    "knowledge-check-evaluation",
    async (trace) => {
      trace.update({
        input,
        metadata: { attempt_id: attemptId, check_id: checkId, agent_id: agentId },
      });
      // userId groups traces per agent; sessionId groups every attempt on the same check.
      return propagateAttributes(
        {
          userId: agentId,
          sessionId: checkId,
          metadata: { attempt_id: attemptId, check_id: checkId, agent_id: agentId },
          tags: ["knowledge-check"],
        },
        () => callback(trace),
      );
    },
    { parentSpanContext },
  );
}

export function startLangfuseSpan(
  name: string,
  metadata: Record<string, unknown>,
  startTime?: Date,
): LangfuseSpan {
  return startObservation(name, { metadata }, { startTime });
}

export function startLangfuseGeneration(
  name: string,
  attributes: LangfuseGenerationAttributes,
): LangfuseGeneration {
  return startObservation(name, attributes, { asType: "generation" });
}

export async function flushLangfuse(attemptId: string): Promise<void> {
  if (!langfuseSpanProcessor) return;
  try {
    await langfuseSpanProcessor.forceFlush();
  } catch (error) {
    createLogger({ attemptId }).warn("EVAL", "Langfuse flush failed; trace may be incomplete", {
      error: serializeError(error),
    });
  }
}
