import { Circle, CircleAlert, CircleCheck, LoaderCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export type SubmissionPhase = "preparing" | "uploading" | "transcribing" | "evaluating" | "redirecting" | "failed";

interface SubmissionProgressProps {
  phase: SubmissionPhase;
  failedAt: Exclude<SubmissionPhase, "failed" | "redirecting"> | null;
  uploadedCount: number;
  totalRecordings: number;
  error: string | null;
  onRetry: () => void;
}

type StepState = "done" | "active" | "pending" | "failed";

const STEP_ORDER = ["preparing", "uploading", "transcribing", "evaluating"] as const;
type StepKey = (typeof STEP_ORDER)[number];

function stepLabel(step: StepKey, uploadedCount: number, totalRecordings: number): string {
  switch (step) {
    case "preparing":
      return "Starting your submission...";
    case "uploading":
      return `Uploading recordings (${uploadedCount}/${totalRecordings})...`;
    case "transcribing":
      return "Transcribing audio...";
    case "evaluating":
      return "Claude evaluating answers...";
  }
}

function stepState(step: StepKey, phase: SubmissionPhase, failedAt: StepKey | null): StepState {
  const stepIndex = STEP_ORDER.indexOf(step);
  if (phase === "redirecting") return "done";
  if (phase === "failed") {
    const failedIndex = failedAt ? STEP_ORDER.indexOf(failedAt) : -1;
    if (stepIndex < failedIndex) return "done";
    return stepIndex === failedIndex ? "failed" : "pending";
  }
  const activeIndex = STEP_ORDER.indexOf(phase);
  if (stepIndex < activeIndex) return "done";
  return stepIndex === activeIndex ? "active" : "pending";
}

function StepIcon({ state }: { state: StepState }) {
  switch (state) {
    case "done":
      return <CircleCheck className="size-5 text-emerald-600" aria-hidden />;
    case "active":
      return <LoaderCircle className="size-5 animate-spin text-indigo-600" aria-hidden />;
    case "failed":
      return <CircleAlert className="size-5 text-rose-600" aria-hidden />;
    case "pending":
      return <Circle className="size-5 text-slate-300" aria-hidden />;
  }
}

export function SubmissionProgress({
  phase,
  failedAt,
  uploadedCount,
  totalRecordings,
  error,
  onRetry,
}: SubmissionProgressProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-live="polite">
      <h2 className="text-lg font-semibold text-slate-900">
        {phase === "failed"
          ? "Submission didn't finish"
          : phase === "redirecting"
            ? "Evaluation complete"
            : "Submitting your assessment"}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {phase === "failed"
          ? "Your recordings are still here. You can try again without re-recording."
          : phase === "redirecting"
            ? "Opening your results..."
            : "Keep this tab open. This usually takes under a minute."}
      </p>

      <ol className="mt-6 space-y-4">
        {STEP_ORDER.map((step) => {
          const state = stepState(step, phase, failedAt);
          return (
            <li key={step} className="flex items-center gap-3">
              <StepIcon state={state} />
              <span
                className={cn(
                  "text-sm",
                  state === "active" && "font-semibold text-slate-900",
                  state === "done" && "text-slate-600",
                  state === "pending" && "text-slate-400",
                  state === "failed" && "font-semibold text-rose-700",
                )}
              >
                {stepLabel(step, uploadedCount, totalRecordings)}
              </span>
            </li>
          );
        })}
      </ol>

      {phase === "failed" ? (
        <div className="mt-6 space-y-3">
          {error ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            <RotateCcw className="size-4" aria-hidden />
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
