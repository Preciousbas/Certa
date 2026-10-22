import { payments, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { enqueueJob } from "../server/jobs/enqueue.js";
import { registerJobHandler } from "../server/jobs/worker.js";

export type ReleaseCall = {
  projectId: string;
  stageId: string;
  approvalId: string;
  stageIndex: number;
  amountMicro: bigint;
  capMicro: bigint;
};

type ReleaseResult = { ok: true; explorerLink: string } | { ok: false; reason: string };

function textField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function indexField(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return +value;
  return -1;
}

function microField(value: unknown): bigint | null {
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

export async function enqueueReleaseRetry(db: Database, input: ReleaseCall & { idempotencyKey: string }): Promise<void> {
  await enqueueJob(db, {
    kind: "release_retry",
    dedupeKey: input.idempotencyKey,
    payload: {
      idempotencyKey: input.idempotencyKey,
      projectId: input.projectId,
      stageId: input.stageId,
      approvalId: input.approvalId,
      stageIndex: input.stageIndex,
      amountMicro: input.amountMicro.toString(),
      capMicro: input.capMicro.toString(),
    },
  });
}

export async function runReleaseRetry(db: Database, payload: Record<string, unknown>, release: (input: ReleaseCall) => Promise<ReleaseResult>): Promise<"skipped" | "released"> {
  const idempotencyKey = textField(payload.idempotencyKey);
  const projectId = textField(payload.projectId);
  const stageId = textField(payload.stageId);
  const approvalId = textField(payload.approvalId);
  const stageIndex = indexField(payload.stageIndex);
  const amountMicro = microField(payload.amountMicro);
  const capMicro = microField(payload.capMicro);
  if (!idempotencyKey || !projectId || !stageId || !approvalId || stageIndex < 0 || amountMicro === null || capMicro === null) return "skipped";
  const payment = (await db.select().from(payments).where(eq(payments.idempotencyKey, idempotencyKey)))[0];
  if (!payment || payment.status === "confirmed") return "skipped";
  const released = await release({ projectId, stageId, approvalId, stageIndex, amountMicro, capMicro });
  if (!released.ok) throw new Error(released.reason);
  await db.update(payments).set({ status: "confirmed", txHash: released.explorerLink }).where(eq(payments.id, payment.id));
  return "released";
}

export function registerReleaseRetry(): void {
  registerJobHandler("release_retry", async (payload) => {
    const { getDatabase } = await import("@certa/db");
    const db = await getDatabase();
    const { releaseStageTx } = await import("../server/chain/flows.js");
    await runReleaseRetry(db, payload, async (input) => {
      const tx = await releaseStageTx(db, input);
      const hash = tx.txHash ?? "";
      return { ok: true, explorerLink: hash ? `https://sepolia.etherscan.io/tx/${hash}` : "pending" };
    });
  });
}
