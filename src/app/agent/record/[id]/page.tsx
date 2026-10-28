import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { RecordingWizard } from "@/components/agent/recording-wizard";
import { AppHeader } from "@/components/app-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { countUsedAttempts, MAX_ATTEMPTS_PER_CHECK } from "@/lib/assessment/attempts";
import { getCheckForAgent } from "@/lib/assessment/checks";
import { requireRole } from "@/lib/require-role";
import { isUuid } from "@/lib/utils";
import { REQUIRED_QUESTION_COUNT } from "@/lib/validation/knowledge-check";

export const metadata: Metadata = {
  title: "Record Assessment · NOCD Knowledge Check",
};

interface RecordAssessmentProps {
  params: PageProps<"/agent/record/[id]">["params"];
}

async function RecordAssessment({ params }: RecordAssessmentProps) {
  const { id } = await params;
  const { supabase, auth } = await requireRole("agent", `/agent/record/${id}`);

  if (!isUuid(id)) notFound();

  const check = await getCheckForAgent(id);
  if (!check) notFound();

  const { questions } = check;
  const usedAttempts = await countUsedAttempts(supabase, auth.userId, check.id);
  const attemptsRemaining = Math.max(0, MAX_ATTEMPTS_PER_CHECK - usedAttempts);

  return (
    <>
      <AppHeader email={auth.email} role={auth.role} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-6 py-10">
        <Link
          href="/agent"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All knowledge checks
        </Link>
        {questions.length !== REQUIRED_QUESTION_COUNT ? (
          <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            This knowledge check is misconfigured and can&apos;t be taken. Ask your manager to republish it.
          </p>
        ) : attemptsRemaining === 0 ? (
          <p role="alert" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            You&apos;ve used all {MAX_ATTEMPTS_PER_CHECK} attempts for this knowledge check. Your results are listed on
            the knowledge checks page.
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              {attemptsRemaining} of {MAX_ATTEMPTS_PER_CHECK} attempts remaining.
            </p>
            <RecordingWizard checkId={check.id} topic={check.topic} questions={questions} />
          </>
        )}
      </main>
    </>
  );
}

export default function RecordAssessmentPage({ params }: PageProps<"/agent/record/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RecordAssessment params={params} />
    </Suspense>
  );
}
