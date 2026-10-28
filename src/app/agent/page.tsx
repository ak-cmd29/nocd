import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, Inbox, Mic } from "lucide-react";
import { overallScore, ScoreBadge } from "@/components/agent/score-badge";
import { AppHeader } from "@/components/app-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { effectiveStatus, MAX_ATTEMPTS_PER_CHECK, usedAttemptsByCheck } from "@/lib/assessment/attempts";
import { listChecksForAgent } from "@/lib/assessment/checks";
import { requireRole } from "@/lib/require-role";

export const metadata: Metadata = {
  title: "Knowledge Checks · NOCD Knowledge Check",
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

async function AgentHome() {
  const { supabase, auth } = await requireRole("agent", "/agent");

  const [checksResult, { data: attempts }, { data: limitAttempts }] = await Promise.all([
    listChecksForAgent().then(
      (checks) => ({ checks, error: null }),
      (error: unknown) => ({ checks: null, error }),
    ),
    supabase
      .from("attempts")
      .select("id, check_id, status, evaluation, created_at")
      .eq("agent_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("attempts")
      .select("check_id, status, created_at")
      .eq("agent_id", auth.userId)
      .in("status", ["processing", "completed"]),
  ]);
  const { checks, error } = checksResult;
  if (error) console.error(error);
  const topicsById = new Map((checks ?? []).map((check) => [check.id, check.topic]));
  const usedByCheck = usedAttemptsByCheck(limitAttempts ?? []);

  return (
    <>
      <AppHeader email={auth.email} role={auth.role} />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Knowledge checks</h1>
          <p className="mt-1 text-sm text-slate-500">
            Each check has three questions. You&apos;ll record a spoken answer for each one.
          </p>
        </div>

        {error ? (
          <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <CircleAlert className="size-4" aria-hidden />
            Could not load knowledge checks. Refresh the page to try again.
          </p>
        ) : !checks || checks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <Inbox className="size-8 text-slate-300" aria-hidden />
            <p className="text-sm font-medium text-slate-700">No knowledge checks have been published yet</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {checks.map((check) => {
              const remaining = Math.max(0, MAX_ATTEMPTS_PER_CHECK - (usedByCheck.get(check.id) ?? 0));
              return (
                <li
                  key={check.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{check.topic}</p>
                    <p className="text-xs text-slate-500">
                      Published {DATE_FORMAT.format(new Date(check.created_at))} · {remaining} of{" "}
                      {MAX_ATTEMPTS_PER_CHECK} attempts remaining
                    </p>
                  </div>
                  {remaining > 0 ? (
                    <Link
                      href={`/agent/record/${check.id}`}
                      className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
                    >
                      <Mic className="size-4" aria-hidden />
                      Start assessment
                    </Link>
                  ) : (
                    <span className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-500">
                      No attempts left
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {attempts && attempts.length > 0 ? (
          <section className="space-y-3 pt-4">
            <h2 className="text-lg font-semibold text-slate-900">Your attempts</h2>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {attempts.map((attempt) => (
                <li key={attempt.id}>
                  <Link
                    href={`/agent/results/${attempt.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {topicsById.get(attempt.check_id) ?? "Knowledge check"}
                      </p>
                      <p className="text-xs text-slate-500">{DATE_FORMAT.format(new Date(attempt.created_at))}</p>
                    </div>
                    {attempt.status === "completed" && attempt.evaluation.length > 0 ? (
                      <ScoreBadge score={overallScore(attempt.evaluation.map((result) => result.score))} />
                    ) : (
                      <span className="text-xs font-medium capitalize text-slate-500">
                        {effectiveStatus(attempt.status, attempt.created_at)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}

export default function AgentPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AgentHome />
    </Suspense>
  );
}
