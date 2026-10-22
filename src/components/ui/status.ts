export type ChipTone = "neutral" | "info" | "warning" | "danger" | "success";

export type StageChip = { label: string; tone: ChipTone };

const CHIPS: Record<string, StageChip> = {
  not_started: { label: "Not started", tone: "neutral" },
  in_progress: { label: "In progress", tone: "info" },
  submitted: { label: "Checking photos", tone: "warning" },
  ai_review: { label: "Checking photos", tone: "warning" },
  ai_fail: { label: "Needs work", tone: "danger" },
  needs_more_evidence: { label: "More photos needed", tone: "warning" },
  awaiting_certification: { label: "Waiting for consultant", tone: "warning" },
  awaiting_client_approval: { label: "Waiting for client approval", tone: "warning" },
  approved: { label: "Paying", tone: "info" },
  releasing: { label: "Paying", tone: "info" },
  released: { label: "Released", tone: "success" },
  release_failed: { label: "Payment retrying", tone: "danger" },
  disputed: { label: "Disputed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  pending: { label: "Not started", tone: "neutral" },
  funded: { label: "Not started", tone: "neutral" },
};

export function stageChip(status: string): StageChip {
  return CHIPS[status] ?? { label: "Not started", tone: "neutral" };
}
