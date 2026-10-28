import { CircleCheck, CircleMinus, MessageSquareQuote, ShieldAlert } from "lucide-react";
import type { EvaluationResult, Question } from "@/types";
import { ScoreBadge } from "./score-badge";

interface QuestionResultProps {
  index: number;
  question: Question;
  audioUrl: string | null;
  transcript: string;
  evaluation: EvaluationResult | null;
}

export function QuestionResult({ index, question, audioUrl, transcript, evaluation }: QuestionResultProps) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Question {index + 1}</p>
          <p className="mt-1 text-base leading-relaxed text-slate-900">{question.prompt}</p>
        </div>
        {evaluation ? <ScoreBadge score={evaluation.score} size="lg" /> : null}
      </header>

      <div className="px-6 pt-4">
        <details className="rounded-lg bg-slate-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700 select-none">Grading criteria</summary>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-slate-600">{question.criteria}</p>
        </details>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your recording</h3>
          {audioUrl ? (
            <audio controls preload="none" src={audioUrl} className="w-full">
              Your browser does not support audio playback.
            </audio>
          ) : (
            <p className="text-sm text-slate-500">Recording unavailable.</p>
          )}
          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <MessageSquareQuote className="size-3.5" aria-hidden />
              Transcript (what the system heard)
            </h3>
            <blockquote className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
              {transcript || <span className="italic text-slate-500">No speech was detected in this recording.</span>}
            </blockquote>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Claude&apos;s evaluation</h3>
          {evaluation ? (
            <>
              {evaluation.reassurance_violation ? (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <p>
                    <span className="font-semibold">Clinical boundary: reassurance detected.</span> Advocates must not
                    reassure members about the content of intrusive thoughts. This answer is an automatic fail.
                  </p>
                </div>
              ) : null}

              <div>
                <p className="text-sm font-semibold text-slate-900">Key concepts found</p>
                {evaluation.concepts_identified.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {evaluation.concepts_identified.map((concept) => (
                      <li key={concept} className="flex items-start gap-2 text-sm text-slate-700">
                        <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                        {concept}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">None identified.</p>
                )}
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-900">Missing or incorrect</p>
                {evaluation.critical_omissions.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {evaluation.critical_omissions.map((omission) => (
                      <li key={omission} className="flex items-start gap-2 text-sm text-slate-700">
                        <CircleMinus className="mt-0.5 size-4 shrink-0 text-rose-500" aria-hidden />
                        {omission}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">Nothing missing.</p>
                )}
              </div>

              <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
                <p className="text-sm font-semibold text-indigo-900">Coaching</p>
                <p className="mt-1 text-sm leading-relaxed text-indigo-950/80">{evaluation.actionable_feedback}</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">No evaluation was recorded for this question.</p>
          )}
        </section>
      </div>
    </article>
  );
}
