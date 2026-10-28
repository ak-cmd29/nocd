import Link from "next/link";
import { Eye, Inbox } from "lucide-react";
import type { KnowledgeCheckSummary } from "@/types";
import { RemoveCheckButton } from "./remove-check-button";

interface ChecksTableProps {
  checks: KnowledgeCheckSummary[];
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function ChecksTable({ checks }: ChecksTableProps) {
  if (checks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <Inbox className="size-8 text-slate-300" aria-hidden />
        <p className="text-sm font-medium text-slate-700">No knowledge checks published yet</p>
        <p className="text-sm text-slate-500">Upload a JSON file or load the sample check to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-600">
              Topic
            </th>
            <th scope="col" className="hidden px-4 py-3 text-left font-semibold text-slate-600 sm:table-cell">
              Questions
            </th>
            <th scope="col" className="hidden px-4 py-3 text-left font-semibold text-slate-600 md:table-cell">
              Published
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-600">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {checks.map((check) => (
            <tr key={check.id} className="hover:bg-slate-50/60">
              <td className="px-4 py-3 font-medium text-slate-900">{check.topic}</td>
              <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{check.question_count}</td>
              <td className="hidden px-4 py-3 whitespace-nowrap text-slate-600 md:table-cell">
                {DATE_FORMAT.format(new Date(check.created_at))}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex flex-wrap items-start justify-end gap-1">
                  <Link
                    href={`/manager/checks/${check.id}`}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-indigo-600 transition hover:bg-indigo-50"
                  >
                    <Eye className="size-4" aria-hidden />
                    Preview
                  </Link>
                  <RemoveCheckButton checkId={check.id} topic={check.topic} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
