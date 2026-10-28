"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";
import { isApiErrorResponse } from "@/lib/api";

interface RemoveCheckButtonProps {
  checkId: string;
  topic: string;
}

type RemoveState = { kind: "idle" } | { kind: "confirming" } | { kind: "removing" } | { kind: "error"; message: string };

export function RemoveCheckButton({ checkId, topic }: RemoveCheckButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<RemoveState>({ kind: "idle" });

  async function handleRemove() {
    setState({ kind: "removing" });
    try {
      const response = await fetch(`/api/checks/${checkId}`, { method: "DELETE" });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setState({
          kind: "error",
          message: isApiErrorResponse(body) ? body.error : `Removal failed (HTTP ${response.status}).`,
        });
        return;
      }
      setState({ kind: "idle" });
      router.refresh();
    } catch {
      setState({ kind: "error", message: "Network error while removing. Check your connection and try again." });
    }
  }

  if (state.kind === "confirming" || state.kind === "removing") {
    const isRemoving = state.kind === "removing";
    return (
      <div
        role="alertdialog"
        aria-label={`Remove ${topic}`}
        className="inline-flex flex-wrap items-center justify-end gap-2 text-left"
      >
        <span className="max-w-64 text-xs text-slate-600">
          Remove this check? All agent attempts and recordings for it are deleted too.
        </span>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          disabled={isRemoving}
          className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleRemove()}
          disabled={isRemoving}
          className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
        >
          {isRemoving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
          {isRemoving ? "Removing…" : "Remove"}
        </button>
      </div>
    );
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setState({ kind: "confirming" })}
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-rose-600 transition hover:bg-rose-50"
      >
        <Trash2 className="size-4" aria-hidden />
        Remove
      </button>
      {state.kind === "error" ? (
        <span role="alert" className="text-xs text-rose-700">
          {state.message}
        </span>
      ) : null}
    </span>
  );
}
