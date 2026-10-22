import { changeStatusLabel, stageStatusLabel } from "../lib/labels";

function toneForStage(status: string): string {
  if (status === "released") return "released";
  if (
    status === "submitted" ||
    status === "ai_review" ||
    status.startsWith("awaiting") ||
    status === "needs_more_evidence"
  )
    return "review";
  if (status === "disputed") return "disputed";
  if (
    status === "not_started" ||
    status === "in_progress" ||
    status === "approved" ||
    status === "releasing"
  )
    return "locked";
  return "waiting";
}

function toneForChange(status: string): string {
  if (status === "accepted") return "released";
  if (status === "rejected") return "disputed";
  if (status === "escalated") return "review";
  return "waiting";
}

export function StatusChip({
  status,
  kind = "stage",
}: {
  status: string;
  kind?: "stage" | "change";
}) {
  const label = kind === "change" ? changeStatusLabel(status) : stageStatusLabel(status);
  const tone = kind === "change" ? toneForChange(status) : toneForStage(status);
  return (
    <span className={`chip chip-${tone}`}>
      <span className="chip-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
