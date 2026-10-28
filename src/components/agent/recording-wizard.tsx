"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, LoaderCircle, Mic, RotateCcw, Send, Square } from "lucide-react";
import { startAttempt } from "@/app/agent/record/[id]/actions";
import { useAudioRecorder, type RecordingResult } from "@/hooks/use-audio-recorder";
import { requestEvaluation, uploadRecordings } from "@/lib/assessment/submit";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDuration } from "@/lib/utils";
import type { AgentQuestion } from "@/types";
import { SubmissionProgress, type SubmissionPhase } from "./submission-progress";

const MAX_ANSWER_MS = 3 * 60 * 1000;
const MIN_ANSWER_MS = 2_000;

interface QuestionRecording {
  blob: Blob;
  url: string;
  durationMs: number;
}

interface RecordingWizardProps {
  checkId: string;
  topic: string;
  questions: AgentQuestion[];
}

type FailedStep = Exclude<SubmissionPhase, "failed" | "redirecting">;

export function RecordingWizard({ checkId, topic, questions }: RecordingWizardProps) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [recordings, setRecordings] = useState<(QuestionRecording | null)[]>(() => questions.map(() => null));
  const [phase, setPhase] = useState<SubmissionPhase | null>(null);
  const [failedAt, setFailedAt] = useState<FailedStep | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const recordingIndexRef = useRef(0);
  const recordingsRef = useRef(recordings);

  useEffect(() => {
    recordingsRef.current = recordings;
  }, [recordings]);

  useEffect(() => {
    return () => {
      for (const recording of recordingsRef.current) {
        if (recording) URL.revokeObjectURL(recording.url);
      }
    };
  }, []);

  const handleRecordingComplete = useCallback((result: RecordingResult) => {
    const index = recordingIndexRef.current;
    const url = URL.createObjectURL(result.blob);
    const previous = recordingsRef.current[index];
    if (previous) URL.revokeObjectURL(previous.url);
    setRecordings((current) =>
      current.map((recording, i) => (i === index ? { blob: result.blob, url, durationMs: result.durationMs } : recording)),
    );
  }, []);

  const recorder = useAudioRecorder({
    maxDurationMs: MAX_ANSWER_MS,
    minDurationMs: MIN_ANSWER_MS,
    onComplete: handleRecordingComplete,
  });

  const recordedCount = recordings.filter(Boolean).length;
  const allRecorded = recordedCount === questions.length;
  const isRecorderBusy = recorder.status !== "idle";
  const isSubmitting = phase !== null && phase !== "failed";
  const hasUnsubmittedWork = recordedCount > 0 && phase !== "redirecting";

  useEffect(() => {
    if (!hasUnsubmittedWork && !isRecorderBusy) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsubmittedWork, isRecorderBusy]);

  function startRecording() {
    recordingIndexRef.current = currentIndex;
    void recorder.start();
  }

  function goTo(index: number) {
    if (isRecorderBusy || index < 0 || index >= questions.length) return;
    setCurrentIndex(index);
  }

  async function handleSubmit() {
    const blobs = recordings.map((recording) => recording?.blob);
    if (!blobs.every((blob): blob is Blob => blob instanceof Blob)) return;

    let step: FailedStep = "preparing";
    setSubmitError(null);
    setFailedAt(null);
    setUploadedCount(0);
    setPhase("preparing");

    try {
      const started = await startAttempt(checkId);
      if (!started.ok) throw new Error(started.error);

      step = "uploading";
      setPhase("uploading");
      const audioUrls = await uploadRecordings(supabase, started.attemptId, blobs, setUploadedCount);

      step = "transcribing";
      setPhase("transcribing");
      const attemptId = await requestEvaluation({ checkId, attemptId: started.attemptId, audioUrls }, (stage) => {
        step = stage;
        setPhase(stage);
      });

      setPhase("redirecting");
      router.push(`/agent/results/${attemptId}`);
    } catch (error) {
      setFailedAt(step);
      setSubmitError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
      setPhase("failed");
    }
  }

  if (phase !== null) {
    return (
      <SubmissionProgress
        phase={phase}
        failedAt={failedAt}
        uploadedCount={uploadedCount}
        totalRecordings={questions.length}
        error={submitError}
        onRetry={() => void handleSubmit()}
      />
    );
  }

  const question = questions[currentIndex];
  const currentRecording = recordings[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Knowledge check</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{topic}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Answer each question out loud as you would with a member. Up to {formatDuration(MAX_ANSWER_MS)} per answer.
        </p>
      </div>

      <ol className="grid grid-cols-3 gap-2" aria-label="Questions">
        {questions.map((item, index) => {
          const isCurrent = index === currentIndex;
          const isRecorded = recordings[index] !== null;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => goTo(index)}
                disabled={isRecorderBusy}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed",
                  isCurrent
                    ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {isRecorded ? (
                  <CircleCheck className="size-4 shrink-0 text-emerald-600" aria-label="Recorded" />
                ) : (
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                      isCurrent ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600",
                    )}
                  >
                    {index + 1}
                  </span>
                )}
                Question {index + 1}
              </button>
            </li>
          );
        })}
      </ol>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Question {currentIndex + 1} of {questions.length}
        </p>
        <p className="mt-2 text-base leading-relaxed text-slate-900">{question.prompt}</p>

        <div className="mt-6 rounded-xl bg-slate-50 p-5">
          {recorder.status === "recording" ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3" aria-live="polite">
                <span className="relative flex size-3">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex size-3 rounded-full bg-rose-600" />
                </span>
                <span className="font-mono text-lg tabular-nums text-slate-900">
                  {formatDuration(recorder.elapsedMs)}
                </span>
                <span className="text-sm text-slate-500">/ {formatDuration(MAX_ANSWER_MS)}</span>
              </div>
              <button
                type="button"
                onClick={recorder.stop}
                className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                <Square className="size-4 fill-current" aria-hidden />
                Stop
              </button>
            </div>
          ) : recorder.status === "requesting" ? (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Waiting for microphone access...
            </p>
          ) : currentRecording ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CircleCheck className="size-4" aria-hidden />
                  Answer recorded ({formatDuration(currentRecording.durationMs)})
                </p>
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  <RotateCcw className="size-4" aria-hidden />
                  Re-record
                </button>
              </div>
              <audio controls src={currentRecording.url} className="w-full" preload="metadata">
                Your browser does not support audio playback.
              </audio>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <button
                type="button"
                onClick={startRecording}
                className="flex items-center gap-2 rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500"
              >
                <Mic className="size-5" aria-hidden />
                Record answer
              </button>
              <p className="text-xs text-slate-500">Your browser will ask for microphone access the first time.</p>
            </div>
          )}

          {recorder.error ? (
            <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-rose-700">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {recorder.error}
            </p>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => goTo(currentIndex - 1)}
          disabled={currentIndex === 0 || isRecorderBusy}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Back
        </button>

        <span className="text-sm text-slate-500">
          {recordedCount} of {questions.length} recorded
        </span>

        {isLastQuestion ? (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!allRecorded || isRecorderBusy || isSubmitting}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Send className="size-4" aria-hidden />
            Submit Assessment
          </button>
        ) : (
          <button
            type="button"
            onClick={() => goTo(currentIndex + 1)}
            disabled={!currentRecording || isRecorderBusy}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Next
            <ChevronRight className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
