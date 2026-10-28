import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EvaluationScore } from "@/types";

const SCORE_STYLES: Record<EvaluationScore, { label: string; className: string; Icon: typeof CircleCheck }> = {
  pass: { label: "Pass", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", Icon: CircleCheck },
  needs_review: { label: "Needs review", className: "bg-amber-50 text-amber-800 ring-amber-600/20", Icon: CircleAlert },
  fail: { label: "Fail", className: "bg-rose-50 text-rose-700 ring-rose-600/20", Icon: CircleX },
};

interface ScoreBadgeProps {
  score: EvaluationScore;
  size?: "sm" | "lg";
}

export function ScoreBadge({ score, size = "sm" }: ScoreBadgeProps) {
  const { label, className, Icon } = SCORE_STYLES[score];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset",
        size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs",
        className,
      )}
    >
      <Icon className={size === "lg" ? "size-4" : "size-3.5"} aria-hidden />
      {label}
    </span>
  );
}

export function overallScore(scores: EvaluationScore[]): EvaluationScore {
  if (scores.includes("fail")) return "fail";
  if (scores.includes("needs_review")) return "needs_review";
  return "pass";
}
