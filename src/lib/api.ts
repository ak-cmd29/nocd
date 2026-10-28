import type { ApiErrorResponse, EvaluateProgressEvent } from "@/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    isRecord(value) &&
    typeof value.error === "string" &&
    (value.details === undefined ||
      (Array.isArray(value.details) && value.details.every((item) => typeof item === "string")))
  );
}

export function isEvaluateProgressEvent(value: unknown): value is EvaluateProgressEvent {
  if (!isRecord(value)) return false;
  switch (value.stage) {
    case "transcribing":
    case "evaluating":
      return true;
    case "completed":
      return typeof value.attemptId === "string";
    case "failed":
      return typeof value.error === "string";
    default:
      return false;
  }
}
