import { approvals, stages, submissions, type Database } from "@certa/db";
import { and, desc, eq } from "drizzle-orm";
import { audit } from "../audit.js";
import { transitionStage, type StageStatus } from "../stages/transition.js";
import type { StageSubmitter } from "./run.js";

const WALK: Record<string, readonly StageStatus[]> = {
  ai_fail: ["submitted", "ai_review", "awaiting_certification"],
  needs_more_evidence: ["submitted", "ai_review", "awaiting_certification"],
};

export async function applyAiOverride(
  db: Database,
  input: {
    projectId: string;
    workspaceId: string;
    stageId: string;
    userId: string;
    reason: string;
    submit: StageSubmitter;
  },
): Promise<{ txHash: string | null }> {
  const reason = input.reason.trim();
  if (reason.length < 20) throw new Error("Write at least 20 characters so the override is on the record.");
  const stage = (await db.select().from(stages).where(and(eq(stages.id, input.stageId), eq(stages.projectId, input.projectId))))[0];
  if (!stage) throw new Error("That stage is not on this project.");
  const before = stage.status;
  const steps = WALK[stage.status] ?? [];
  for (const step of steps) await transitionStage(db, stage.id, step);
  await db.insert(approvals).values({
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    stageId: stage.id,
    byUserId: input.userId,
    decision: "certified",
    reason,
  });
  await audit(db, {
    action: "ai_override",
    entity: "stages",
    entityId: stage.id,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    actor: input.userId,
    reason,
    before: { status: before },
    after: { status: "awaiting_certification" },
  });
  const submission = (
    await db.select().from(submissions).where(eq(submissions.stageId, stage.id)).orderBy(desc(submissions.createdAt))
  )[0];
  if (!submission?.evidenceHash?.startsWith("0x")) return { txHash: null };
  const sent = await input.submit(db, {
    projectId: input.projectId,
    stageId: stage.id,
    submissionId: submission.id,
    evidenceHash: submission.evidenceHash as `0x${string}`,
    stageIndex: stage.onChainIdx,
  });
  return { txHash: sent.txHash };
}
