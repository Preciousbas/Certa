import { usdcFromNgnKobo } from "@certa/shared";
import { stageChip } from "../../../src/components/ui/status";
import { z } from "zod";

const newStage = z.object({
  name: z.string().min(1),
  amountNgnKobo: z.string().regex(/^\d+$/),
});

const REVIEW_STATUSES = new Set([
  "submitted",
  "ai_review",
  "needs_more_evidence",
  "awaiting_certification",
  "awaiting_client_approval",
]);

export function isReviewStatus(status: string): boolean {
  return REVIEW_STATUSES.has(status);
}

export function isLockedStage(status: string, funded: boolean): boolean {
  return funded && status !== "released" && status !== "cancelled" && !REVIEW_STATUSES.has(status);
}

export function stageStatusLabel(status: string): string {
  // Funding is a boolean. Migration 0003 stores funded stages as not_started.
  return stageChip(status).label;
}

export function changeStatusLabel(status: string): string {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Declined";
    case "escalated":
      return "With the consultant";
    default:
      return "Waiting on the contractor";
  }
}

const titledChange = z.object({
  title: z.string().min(1),
  amountKobo: z.string().regex(/^-?\d+$/),
});

export function changeSummary(
  type: string,
  after: unknown,
  fxRateKoboPerUsdc: bigint,
): { title: string; kobo: string; usdc: string } | null {
  if (type === "add" || type === "omit" || type === "alter") {
    const titled = titledChange.safeParse(after);
    if (!titled.success) return null;
    const signed = BigInt(titled.data.amountKobo);
    const abs = signed < 0n ? -signed : signed;
    const kind = type === "add" ? "Add work" : type === "omit" ? "Remove work" : "Change work";
    return {
      title: `${kind}: ${titled.data.title}`,
      kobo: signed.toString(),
      usdc: usdcFromNgnKobo(abs, fxRateKoboPerUsdc).toString(),
    };
  }
  if (type !== "new_stage" && type !== "stage_amount" && type !== "terms") return null;
  const parsed = newStage.safeParse(after);
  if (!parsed.success) return null;
  const kobo = BigInt(parsed.data.amountNgnKobo);
  const kind =
    type === "new_stage" ? "New stage" : type === "stage_amount" ? "Stage amount" : "Terms";
  return {
    title: `${kind}: ${parsed.data.name}`,
    kobo: kobo.toString(),
    usdc: usdcFromNgnKobo(kobo, fxRateKoboPerUsdc).toString(),
  };
}

export function sharePercent(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  return Number((part * 1000n) / total) / 10;
}

export type NavRole = "client" | "consultant" | "contractor" | "subcontractor";

export function viewerNav(
  partyRole: string | undefined,
  workspaceRole: string | undefined,
): { role: NavRole; admin: boolean } {
  const admin = workspaceRole === "admin";
  if (partyRole === "consultant") return { role: "consultant", admin };
  if (partyRole === "main_contractor") return { role: "contractor", admin };
  if (partyRole === "subcontractor") return { role: "subcontractor", admin };
  return { role: "client", admin };
}
