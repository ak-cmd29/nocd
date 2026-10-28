import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { CheckPreview } from "@/components/manager/check-preview";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireRole } from "@/lib/require-role";
import { isUuid } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Check Preview · NOCD Knowledge Check",
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" });

interface CheckDetailProps {
  params: PageProps<"/manager/checks/[checkId]">["params"];
}

async function CheckDetail({ params }: CheckDetailProps) {
  const { checkId } = await params;
  const { supabase, auth } = await requireRole("manager", `/manager/checks/${checkId}`);

  if (!isUuid(checkId)) notFound();

  const { data: check, error } = await supabase
    .from("knowledge_checks")
    .select("id, topic, reference_material, questions, created_at")
    .eq("id", checkId)
    .maybeSingle();

  if (error) throw new Error("Failed to load knowledge check.");
  if (!check) notFound();

  return (
    <>
      <AppHeader email={auth.email} role={auth.role} />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-6 py-10">
        <Link
          href="/manager"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to dashboard
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <p className="text-xs text-slate-500">Published {DATE_FORMAT.format(new Date(check.created_at))}</p>
            <p className="font-mono text-xs text-slate-400">{check.id}</p>
          </div>
          <CheckPreview
            check={{ topic: check.topic, reference_material: check.reference_material, questions: check.questions }}
          />
        </div>
      </main>
    </>
  );
}

export default function CheckPreviewPage({ params }: PageProps<"/manager/checks/[checkId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CheckDetail params={params} />
    </Suspense>
  );
}
