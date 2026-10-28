import type { KnowledgeCheckInput } from "@/types";

interface CheckPreviewProps {
  check: KnowledgeCheckInput;
}

export function CheckPreview({ check }: CheckPreviewProps) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Topic</h3>
        <p className="mt-1 text-lg font-semibold text-slate-900">{check.topic}</p>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Reference material</h3>
        <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
          {check.reference_material}
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {check.reference_material.length.toLocaleString()} characters
        </p>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Questions ({check.questions.length})
        </h3>
        <ol className="mt-2 space-y-4">
          {check.questions.map((question, index) => (
            <li key={question.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="text-xs font-mono text-slate-400">{question.id}</p>
                    <p className="text-sm font-medium leading-relaxed text-slate-900">{question.prompt}</p>
                  </div>
                  <details className="group rounded-md bg-slate-50 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-600 select-none">
                      Grading criteria
                    </summary>
                    <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
                      {question.criteria}
                    </p>
                  </details>
                  {question.sample_good_response ? (
                    <details className="rounded-md bg-emerald-50/60 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold text-emerald-700 select-none">
                        Sample good response
                      </summary>
                      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
                        {question.sample_good_response}
                      </p>
                    </details>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
