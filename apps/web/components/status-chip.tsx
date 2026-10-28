import { stageChip } from "../../../src/components/ui/status";
import { changeStatusLabel } from "../lib/labels";

const TONE = {
  neutral: "waiting",
  info: "locked",
  warning: "review",
  danger: "disputed",
  success: "released",
} as const;

export function StatusChip({
  status,
  kind = "stage",
  label,
}: {
  status: string;
  kind?: "stage" | "change";
  label?: string;
}) {
  if (kind === "change") {
    const tone = status === "accepted" ? "released" : status === "rejected" || status === "declined" ? "disputed" : "review";
    return (
      <span className={`chip chip-${tone}`}>
        <span className="chip-dot" aria-hidden="true" />
        {changeStatusLabel(status)}
      </span>
    );
  }
  const chip = stageChip(status);
  return (
    <span className={`chip chip-${TONE[chip.tone]}`}>
      <span className="chip-dot" aria-hidden="true" />
      {label ?? chip.label}
    </span>
  );
}
