import {
  chainTxs,
  escrows,
  memberships,
  notifications,
  projects,
  stages,
  usageLedger,
  type Database,
} from "@certa/db";
import { eq } from "drizzle-orm";
import { releaseSplit } from "../../lib/money/release-split.js";
import { audit } from "../audit.js";
import { canTransition, transitionStage, type StageStatus } from "../stages/transition.js";
import type { TxIntent } from "./tx.js";

type TxRow = typeof chainTxs.$inferSelect;

function argAddress(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value) ? value : null;
}

async function walk(db: Database, stageId: string, to: StageStatus): Promise<void> {
  const row = (await db.select().from(stages).where(eq(stages.id, stageId)))[0];
  if (!row) return;
  let current = row.status as StageStatus;
  const toward: StageStatus[] =
    to === "released"
      ? ["in_progress", "submitted", "ai_review", "awaiting_certification", "awaiting_client_approval", "approved", "releasing", "released"]
      : to === "disputed"
        ? ["disputed"]
        : [to];
  for (const step of toward) {
    if (current === to) return;
    if (!canTransition(current, step)) continue;
    await transitionStage(db, stageId, step, step === "released" ? true : undefined);
    current = step;
  }
}

export async function markReleaseFailed(db: Database, stageId: string): Promise<void> {
  const row = (await db.select().from(stages).where(eq(stages.id, stageId)))[0];
  if (!row) return;
  if (row.status === "approved") await transitionStage(db, stageId, "releasing");
  if ((await db.select().from(stages).where(eq(stages.id, stageId)))[0]?.status === "releasing") {
    await transitionStage(db, stageId, "release_failed");
  }
}

export async function applyConfirmation(
  db: Database,
  row: TxRow,
  intent: TxIntent,
  logs: { eventName: string; args: Record<string, unknown> }[],
): Promise<void> {
  if (intent.event === "EscrowCreated" && row.projectId && intent.contractVersionId) {
    const created = logs.find((log) => log.eventName === "EscrowCreated");
    const address = created ? argAddress(created.args, "escrow") : null;
    if (address) {
      const inserted = await db
        .insert(escrows)
        .values({
          projectId: row.projectId,
          contractVersionId: intent.contractVersionId,
          chainId: row.chainId,
          factoryAddress: row.toAddress,
          address,
          createTxId: row.id,
        })
        .onConflictDoNothing({ target: escrows.projectId })
        .returning();
      const escrow = inserted[0] ?? (await db.select().from(escrows).where(eq(escrows.projectId, row.projectId)))[0];
      await db
        .update(projects)
        .set({ escrowAddress: address, ...(escrow ? {} : {}) })
        .where(eq(projects.id, row.projectId));
      if (escrow) {
        await db.update(projects).set({ escrowAddress: address }).where(eq(projects.id, row.projectId));
      }
    }
  }
  if (row.stageId && (intent.event === "StageReleased" || intent.event === "DisputeResolved" || intent.event === "RetentionReleased")) {
    const stage = (await db.select().from(stages).where(eq(stages.id, row.stageId)))[0];
    const releasedLog = logs.find((log) => log.eventName === "StageReleased");
    const rawPayout = releasedLog?.args.payout;
    if (stage && typeof rawPayout === "bigint") {
      const expected = releaseSplit({ amountUsdc: stage.amountUsdc, amountNgnKobo: stage.amountNgnKobo, retentionBps: stage.retentionBps }).payoutUsdc;
      if (rawPayout !== expected) {
        await audit(db, {
          action: "release.amount_mismatch",
          entity: "stages",
          entityId: stage.id,
          projectId: row.projectId ?? undefined,
          actorKind: "system",
          after: { payout: rawPayout.toString(), expected: expected.toString() },
        });
      }
    }
    await walk(db, row.stageId, "released");
    await recordReleaseFee(db, row, logs);
    await notifyPaid(db, row);
  }
  if (row.stageId && intent.event === "StageDisputed") await walk(db, row.stageId, "disputed");
  if (intent.event === "Funded" && row.projectId && intent.upToStage !== undefined) {
    const rows = await db.select().from(stages).where(eq(stages.projectId, row.projectId));
    for (const stage of rows) {
      if (stage.onChainIdx <= intent.upToStage) {
        await db.update(stages).set({ funded: true }).where(eq(stages.id, stage.id));
      }
    }
  }
  if (row.kind === "release_stage" && row.stageId) {
    const stage = (await db.select().from(stages).where(eq(stages.id, row.stageId)))[0];
    if (stage?.status === "approved") await transitionStage(db, row.stageId, "releasing");
  }
  await audit(db, {
    action: "tx.confirmed",
    entity: "chain_txs",
    entityId: row.id,
    projectId: row.projectId ?? undefined,
    actorKind: "system",
    after: { kind: row.kind, txHash: row.txHash, event: intent.event },
  });
}

async function recordReleaseFee(db: Database, row: TxRow, logs: { eventName: string; args: Record<string, unknown> }[]) {
  if (!row.projectId) return;
  const project = (await db.select().from(projects).where(eq(projects.id, row.projectId)))[0];
  if (!project) return;
  const released = logs.find((log) => log.eventName === "StageReleased" || log.eventName === "RetentionReleased");
  const raw = released?.args.payout ?? released?.args.amount;
  const payout = typeof raw === "bigint" ? raw : 0n;
  const fee = (payout * 50n + 5_000n) / 10_000n;
  await db.insert(usageLedger).values({
    workspaceId: project.workspaceId,
    projectId: project.id,
    kind: "release_fee",
    amountUsdc: fee,
    period: new Date().toISOString().slice(0, 7),
  });
}

async function notifyPaid(db: Database, row: TxRow) {
  if (!row.projectId || !row.txHash) return;
  const member = (
    await db.select().from(memberships).where(eq(memberships.projectId, row.projectId))
  ).find((item) => item.role === "contractor" && item.status === "active");
  if (!member) return;
  await db
    .insert(notifications)
    .values({
      userId: member.userId,
      kind: "stage.paid",
      payload: { txHash: row.txHash, stageId: row.stageId, chainId: row.chainId },
      status: "queued",
      dedupeKey: `paid:${row.id}`,
    })
    .onConflictDoNothing({ target: notifications.dedupeKey });
}
