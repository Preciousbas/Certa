import { appendAudit, projects, stages, type Database } from "@certa/db";
import { stageReviewer } from "../projects/approvalMode.js";
import { and, eq } from "drizzle-orm";
import { stageNeedsWeather } from "../x402/gate.js";
import { enqueuePrePour } from "../x402/prepour.js";

export const STAGE_STATUSES = [
  "not_started",
  "in_progress",
  "submitted",
  "ai_review",
  "ai_fail",
  "needs_more_evidence",
  "awaiting_certification",
  "awaiting_client_approval",
  "approved",
  "releasing",
  "released",
  "release_failed",
  "disputed",
  "cancelled",
] as const;

export type StageStatus = (typeof STAGE_STATUSES)[number];

const EDGES: Record<StageStatus, readonly StageStatus[]> = {
  not_started: ["in_progress", "cancelled"],
  in_progress: ["submitted", "disputed"],
  submitted: ["ai_review", "disputed"],
  ai_review: ["ai_fail", "needs_more_evidence", "awaiting_certification", "awaiting_client_approval", "disputed"],
  ai_fail: ["submitted", "disputed"],
  needs_more_evidence: ["submitted", "disputed"],
  awaiting_certification: ["awaiting_client_approval", "in_progress", "disputed"],
  awaiting_client_approval: ["approved", "in_progress", "disputed"],
  approved: ["releasing"],
  releasing: ["released", "release_failed"],
  release_failed: ["releasing"],
  released: [],
  disputed: ["in_progress", "approved"],
  cancelled: [],
};

export class IllegalTransition extends Error {
  constructor(from: string, to: string) {
    super(`Illegal stage transition ${from} -> ${to}`);
    this.name = "IllegalTransition";
  }
}

export function canTransition(from: StageStatus, to: StageStatus): boolean {
  return EDGES[from].includes(to);
}

function chainStatusToProduct(chainStatus: string): StageStatus | null {
  if (chainStatus === "released") return "released";
  if (chainStatus === "disputed") return "disputed";
  if (chainStatus === "cancelled") return "cancelled";
  if (chainStatus === "submitted") return "submitted";
  if (chainStatus === "funded" || chainStatus === "pending") return "not_started";
  return null;
}

async function writeStatus(
  db: Database,
  stageId: string,
  status: StageStatus,
  funded?: boolean,
): Promise<void> {
  const row = (await db.select().from(stages).where(eq(stages.id, stageId)))[0];
  if (!row) throw new Error("stage missing");
  const from = row.status as StageStatus;
  if (from === status) {
    if (funded !== undefined) await db.update(stages).set({ funded }).where(eq(stages.id, stageId));
    return;
  }
  if (!canTransition(from, status)) throw new IllegalTransition(from, status);
  await db
    .update(stages)
    .set(funded === undefined ? { status } : { status, funded })
    .where(eq(stages.id, stageId));
  await appendAudit(db, {
    workspaceId: row.workspaceId,
    action: "stage.transition",
    entity: "stages",
    entityId: stageId,
    payload: JSON.stringify({ stageId, from, to: status }),
  });
  if (status === "in_progress" && stageNeedsWeather(row)) {
    await enqueuePrePour(db, { projectId: row.projectId, stageId: row.id });
  }
}

export async function transitionStage(
  db: Database,
  stageId: string,
  to: StageStatus,
  funded?: boolean,
): Promise<void> {
  await writeStatus(db, stageId, to, funded);
}

export async function mirrorChainStages(
  db: Database,
  projectId: string,
  chainStatuses: readonly { index: number; status: string }[],
): Promise<void> {
  const known = new Map(chainStatuses.map((row) => [row.index, row.status]));
  const rows = await db.select().from(stages).where(eq(stages.projectId, projectId));
  for (const row of rows) {
    const chain = known.get(row.onChainIdx) ?? known.get(row.stageIndex);
    if (!chain) continue;
    const target = chainStatusToProduct(chain);
    if (!target) continue;
    const funded = chain !== "pending" && chain !== "cancelled";
    let current = row.status as StageStatus;
    const walk: StageStatus[] =
      target === "released"
        ? [
            "in_progress",
            "submitted",
            "ai_review",
            "awaiting_certification",
            "awaiting_client_approval",
            "approved",
            "releasing",
            "released",
          ]
        : target === "submitted"
          ? ["in_progress", "submitted"]
          : [target];
    for (const step of walk) {
      if (current === target) break;
      if (!canTransition(current, step) && current !== step) continue;
      if (current === step) continue;
      await writeStatus(db, row.id, step, step === "released" ? true : funded);
      current = step;
    }
    if (current !== target && canTransition(current, target))
      await writeStatus(db, row.id, target, funded);
    else if (row.funded !== funded)
      await db
        .update(stages)
        .set({ funded })
        .where(and(eq(stages.id, row.id), eq(stages.projectId, projectId)));
  }
}

export async function recordCaptureOutcome(
  db: Database,
  stageId: string,
  outcome: { pass: boolean; releasedOnChain: boolean },
): Promise<void> {
  const row = (await db.select().from(stages).where(eq(stages.id, stageId)))[0];
  if (!row) return;
  let current = row.status as StageStatus;
  const towardReview: StageStatus[] = ["in_progress", "submitted", "ai_review"];
  for (const step of towardReview) {
    if (current === "ai_review" || current === "released") break;
    if (canTransition(current, step)) {
      await writeStatus(db, stageId, step);
      current = step;
    }
  }
  const project = (await db.select().from(projects).where(eq(projects.id, row.projectId)))[0];
  const passStatus: StageStatus = outcome.pass && project && stageReviewer(project, row) === "client" ? "awaiting_client_approval" : "awaiting_certification";
  const verdict: StageStatus = outcome.pass ? passStatus : "needs_more_evidence";
  if (canTransition(current, verdict)) {
    await writeStatus(db, stageId, verdict);
    current = verdict;
  }
  if (!outcome.releasedOnChain) return;
  for (const step of ["awaiting_client_approval", "approved", "releasing", "released"] as const) {
    if (canTransition(current, step)) {
      await writeStatus(db, stageId, step, step === "released" ? true : undefined);
      current = step;
    }
  }
}
