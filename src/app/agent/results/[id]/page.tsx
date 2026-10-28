import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";
import { QuestionResult } from "@/components/agent/question-result";
import { overallScore, ScoreBadge } from "@/components/agent/score-badge";
import { AppHeader } from "@/components/app-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { effectiveStatus } from "@/lib/assessment/attempts";
import { getCheckForResults } from "@/lib/assessment/checks";
import { requireRole } from "@/lib/require-role";
import { isUuid } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Assessment Results · NOCD Knowledge Check",
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" });

interface AttemptResultsProps {
  params: PageProps<"/agent/results/[id]">["params"];
}

async function AttemptResults({ params }: AttemptResultsProps) {
  const { id } = await params;
  const { supabase, auth } = await requireRole(["agent", "manager"], `/agent/results/${id}`);

  if (!isUuid(id)) notFound();

  const { data: attempt, error: attemptError } = await supabase
    .from("attempts")
    .select("id, check_id, status, audio_urls, transcripts, evaluation, created_at")
    .eq("id", id)
    .maybeSingle();
  if (attemptError) throw new Error("Failed to load assessment results.");
  if (!attempt) notFound();

  // RLS only returned the attempt if this viewer owns it or is a manager, so the full check may be shown.
  const check = await getCheckForResults(attempt.check_id);
  if (!check) notFound();

  const status = effectiveStatus(attempt.status, attempt.created_at);
  const backHref = auth.role === "manager" ? "/manager" : "/agent";
  const scores = attempt.evaluation.map((result) => result.score);
  const passedCount = scores.filter((score) => score === "pass").length;
  const evaluationsById = new Map(attempt.evaluation.map((result) => [result.question_id, result]));

  return (
    <>
      <AppHeader email={auth.email} role={auth.role} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-6 py-10">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Link>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Assessment results</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{check.topic}</h1>
              <p className="mt-1 text-sm text-slate-500">Submitted {DATE_FORMAT.format(new Date(attempt.created_at))}</p>
            </div>
            {status === "completed" && scores.length > 0 ? (
              <div className="flex flex-col items-end gap-1">
                <ScoreBadge score={overallScore(scores)} size="lg" />
                <p className="text-sm text-slate-500">
                  {passedCount} of {scores.length} passed
                </p>
              </div>
            ) : null}
          </div>
        </section>

        {status === "processing" ? (
          <section className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-6 text-sm text-indigo-900">
            <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin" aria-hidden />
            <div>
              <p className="font-semibold">Your answers are still being evaluated.</p>
              <p className="mt-1">This usually takes under a minute. Refresh the page to check again.</p>
            </div>
          </section>
        ) : null}

        {status === "failed" ? (
          <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">This attempt could not be evaluated.</p>
                <p className="mt-1">Something went wrong while transcribing or grading. Please take the check again.</p>
              </div>
            </div>
            {auth.role === "agent" ? (
              <Link
                href={`/agent/record/${check.id}`}
                className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 font-semibold text-white transition hover:bg-rose-500"
              >
                <RotateCcw className="size-4" aria-hidden />
                Retake check
              </Link>
            ) : null}
          </section>
        ) : null}

        {status === "completed" ? (
          <div className="space-y-6">
            {check.questions.map((question, index) => (
              <QuestionResult
                key={question.id}
                index={index}
                question={question}
                audioUrl={attempt.audio_urls[index] ?? null}
                transcript={evaluationsById.get(question.id)?.transcript ?? attempt.transcripts[index] ?? ""}
                evaluation={evaluationsById.get(question.id) ?? null}
              />
            ))}
          </div>
        ) : null}
      </main>
    </>
  );
}

export default function AttemptResultsPage({ params }: PageProps<"/agent/results/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AttemptResults params={params} />
    </Suspense>
  );
}
