"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, FileJson, LoaderCircle, RotateCcw, Sparkles, Upload } from "lucide-react";
import sampleCheck from "../../../sample_check.json";
import { isApiErrorResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  MAX_CHECK_FILE_BYTES,
  REQUIRED_QUESTION_COUNT,
  validateKnowledgeCheckInput,
} from "@/lib/validation/knowledge-check";
import type { CreateCheckResponse, KnowledgeCheckInput } from "@/types";
import { CheckPreview } from "./check-preview";

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; checkId: string; topic: string }
  | { kind: "error"; message: string; details: string[] };

interface Draft {
  check: KnowledgeCheckInput;
  source: string;
}

function isCreateCheckResponse(value: unknown): value is CreateCheckResponse {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).id === "string";
}

export function UploadPanel() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  function applyCandidate(candidate: unknown, source: string) {
    setSubmitState({ kind: "idle" });
    const result = validateKnowledgeCheckInput(candidate);
    if (result.ok) {
      setDraft({ check: result.value, source });
      setValidationErrors([]);
    } else {
      setDraft(null);
      setValidationErrors(result.errors);
    }
  }

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".json")) {
      setDraft(null);
      setValidationErrors([`"${file.name}" is not a .json file.`]);
      return;
    }
    if (file.size > MAX_CHECK_FILE_BYTES) {
      setDraft(null);
      setValidationErrors([`"${file.name}" is larger than the 1 MB limit.`]);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch (error) {
      setDraft(null);
      setValidationErrors([
        `"${file.name}" is not valid JSON: ${error instanceof Error ? error.message : "unknown parse error"}.`,
      ]);
      return;
    }
    applyCandidate(parsed, file.name);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void handleFile(file);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function handleReset() {
    setDraft(null);
    setValidationErrors([]);
    setSubmitState({ kind: "idle" });
  }

  async function handlePublish() {
    if (!draft) return;
    setSubmitState({ kind: "submitting" });

    try {
      const response = await fetch("/api/checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft.check),
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.ok && isCreateCheckResponse(body)) {
        setSubmitState({ kind: "success", checkId: body.id, topic: draft.check.topic });
        setDraft(null);
        router.refresh();
        return;
      }

      setSubmitState({
        kind: "error",
        message: isApiErrorResponse(body) ? body.error : `Publishing failed (HTTP ${response.status}).`,
        details: isApiErrorResponse(body) ? (body.details ?? []) : [],
      });
    } catch {
      setSubmitState({
        kind: "error",
        message: "Network error while publishing. Check your connection and try again.",
        details: [],
      });
    }
  }

  const isSubmitting = submitState.kind === "submitting";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <label
          htmlFor="check-file"
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition focus-within:ring-2 focus-within:ring-indigo-500/30",
            isDragging
              ? "border-indigo-500 bg-indigo-50"
              : "border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50",
          )}
        >
          <Upload className={cn("size-8", isDragging ? "text-indigo-600" : "text-slate-400")} aria-hidden />
          <span className="text-sm font-medium text-slate-900">
            Drop a knowledge check <code className="font-mono text-indigo-600">.json</code> file here, or click to
            browse
          </span>
          <span className="text-xs text-slate-500">
            Requires <code className="font-mono">topic</code>, <code className="font-mono">reference_material</code>,
            and exactly {REQUIRED_QUESTION_COUNT} <code className="font-mono">questions</code> with{" "}
            <code className="font-mono">prompt</code> and <code className="font-mono">criteria</code>. Max 1 MB.
          </span>
          <input
            id="check-file"
            type="file"
            accept=".json,application/json"
            onChange={handleInputChange}
            className="sr-only"
          />
        </label>

        <div className="flex flex-col justify-center gap-2 rounded-xl border border-slate-200 bg-white p-5 md:w-64">
          <p className="text-sm font-medium text-slate-900">Reviewing the prototype?</p>
          <p className="text-xs text-slate-500">
            Load the ERP, cash-pay, and Session 1 boundaries check to see the full flow.
          </p>
          <button
            type="button"
            onClick={() => applyCandidate(sampleCheck, "sample_check.json")}
            className="mt-1 flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            <Sparkles className="size-4" aria-hidden />
            Load Sample Check
          </button>
        </div>
      </div>

      {validationErrors.length > 0 ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-rose-800">
            <CircleAlert className="size-4" aria-hidden />
            This file can&apos;t be published yet
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-rose-700">
            {validationErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {submitState.kind === "success" ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
            <CircleCheck className="size-4" aria-hidden />
            Published &ldquo;{submitState.topic}&rdquo;.
          </p>
          <Link
            href={`/manager/checks/${submitState.checkId}`}
            className="text-sm font-semibold text-emerald-700 underline-offset-2 hover:underline"
          >
            View published check
          </Link>
        </div>
      ) : null}

      {draft ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <FileJson className="size-5 text-indigo-600" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-slate-900">Preview before publishing</p>
                <p className="text-xs text-slate-500">Source: {draft.source}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <RotateCcw className="size-4" aria-hidden />
                Discard
              </button>
              <button
                type="button"
                onClick={() => void handlePublish()}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="size-4" aria-hidden />
                )}
                {isSubmitting ? "Publishing…" : "Publish check"}
              </button>
            </div>
          </div>

          {submitState.kind === "error" ? (
            <div role="alert" className="mx-5 mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <p className="font-semibold">{submitState.message}</p>
              {submitState.details.length > 0 ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {submitState.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="p-5">
            <CheckPreview check={draft.check} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
