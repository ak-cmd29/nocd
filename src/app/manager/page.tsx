import { Suspense } from "react";
import type { Metadata } from "next";
import { CircleAlert } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ChecksTable } from "@/components/manager/checks-table";
import { UploadPanel } from "@/components/manager/upload-panel";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireRole } from "@/lib/require-role";
import type { KnowledgeCheckSummary } from "@/types";

export const metadata: Metadata = {
  title: "Manager Dashboard · NOCD Knowledge Check",
};

async function ManagerDashboard() {
  const { supabase, auth } = await requireRole("manager", "/manager");

  const { data, error } = await supabase
    .from("knowledge_checks")
    .select("id, topic, questions, created_at")
    .order("created_at", { ascending: false });

  const checks: KnowledgeCheckSummary[] = (data ?? []).map((row) => ({
    id: row.id,
    topic: row.topic,
    question_count: Array.isArray(row.questions) ? row.questions.length : 0,
    created_at: row.created_at,
  }));

  return (
    <>
      <AppHeader email={auth.email} role={auth.role} />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-10 px-6 py-10">
        <section className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Publish a knowledge check</h1>
            <p className="mt-1 text-sm text-slate-500">
              Upload a structured JSON check. Advocates answer each question out loud, and responses are graded
              against your criteria for conceptual accuracy and clinical boundaries.
            </p>
          </div>
          <UploadPanel />
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Published checks</h2>
              <p className="text-sm text-slate-500">Every check visible to intake advocates.</p>
            </div>
            <span className="text-sm text-slate-500">{checks.length} total</span>
          </div>
          {error ? (
            <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              <CircleAlert className="size-4" aria-hidden />
              Could not load published checks. Refresh the page to try again.
            </p>
          ) : (
            <ChecksTable checks={checks} />
          )}
        </section>
      </main>
    </>
  );
}

export default function ManagerPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ManagerDashboard />
    </Suspense>
  );
}
