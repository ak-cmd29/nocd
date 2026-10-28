import type { SupabaseClient } from "@supabase/supabase-js";
import { isApiErrorResponse, isEvaluateProgressEvent } from "@/lib/api";
import type { Database } from "@/types/database";
import type { EvaluateRequest } from "@/types";
import { RECORDING_FORMATS, RECORDINGS_BUCKET, recordingExtensionForMimeType, recordingPath } from "./recordings";

export type EvaluationStage = "transcribing" | "evaluating";

export async function uploadRecordings(
  supabase: SupabaseClient<Database>,
  attemptId: string,
  blobs: Blob[],
  onUploaded: (completedCount: number) => void,
): Promise<string[]> {
  let completed = 0;

  return Promise.all(
    blobs.map(async (blob, index) => {
      const extension = recordingExtensionForMimeType(blob.type);
      if (!extension) {
        throw new Error(`Question ${index + 1} was recorded in an unsupported format (${blob.type || "unknown"}).`);
      }
      const path = recordingPath(attemptId, index, extension);
      const { error } = await supabase.storage
        .from(RECORDINGS_BUCKET)
        .upload(path, blob, { contentType: RECORDING_FORMATS[extension], upsert: false });
      if (error) {
        throw new Error(`Upload failed for question ${index + 1}: ${error.message}`);
      }

      completed += 1;
      onUploaded(completed);
      return supabase.storage.from(RECORDINGS_BUCKET).getPublicUrl(path).data.publicUrl;
    }),
  );
}

export async function requestEvaluation(
  request: EvaluateRequest,
  onStage: (stage: EvaluationStage) => void,
): Promise<string> {
  const response = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new Error(isApiErrorResponse(body) ? body.error : `Evaluation request failed (HTTP ${response.status}).`);
  }
  if (!response.body) {
    throw new Error("The evaluation service returned an empty response.");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (value) buffer += value;

    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");

    for (const line of lines) {
      if (!line.trim()) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new Error("The evaluation service sent an unreadable progress update.");
      }
      if (!isEvaluateProgressEvent(parsed)) {
        throw new Error("The evaluation service sent an unexpected progress update.");
      }

      switch (parsed.stage) {
        case "transcribing":
        case "evaluating":
          onStage(parsed.stage);
          break;
        case "completed":
          await reader.cancel();
          return parsed.attemptId;
        case "failed":
          await reader.cancel();
          throw new Error(parsed.error);
      }
    }

    if (done) break;
  }

  throw new Error("The evaluation ended before results were ready. Please try again.");
}
