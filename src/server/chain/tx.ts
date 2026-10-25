import { chainTxs, type Database } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { audit } from "../audit.js";
import { enqueueJob } from "../jobs/enqueue.js";
import { SEPOLIA_CHAIN_ID } from "./networks.js";
import { defaultPort, type ChainPort, type Hex } from "./port.js";
import { applyConfirmation, markReleaseFailed } from "./apply.js";

export const TX_KINDS = [
  "create_escrow",
  "accept_terms",
  "approve_usdc",
  "fund",
  "submit_stage",
  "client_approve",
  "release_stage",
  "dispute",
  "resolve_dispute",
  "add_variation",
  "release_retention",
  "refund",
  "x402_payment",
  "gas_topup",
] as const;

export type TxKind = (typeof TX_KINDS)[number];

export type TxIntent = {
  event: string;
  stageIndex?: number;
  upToStage?: number;
  contractVersionId?: string;
  stageId?: string;
  approvalId?: string;
};

export type SendInput = {
  kind: TxKind;
  idempotencyKey: string;
  accountName: string;
  from: Hex;
  to: Hex;
  data: Hex;
  projectId?: string;
  stageId?: string;
  workspaceId?: string;
  valueWei?: bigint;
  valueMicro?: bigint;
  intent: TxIntent;
  chainId?: number;
};

const OPEN = new Set(["submitted", "confirmed", "replaced"]);
const MAX_ATTEMPTS = 3;

function countFromDigits(raw: string, fallback: number): number {
  if (!/^[1-9][0-9]{0,8}$/.test(raw)) return fallback;
  let value = 0;
  for (const char of raw) value = value * 10 + (char.charCodeAt(0) - 48);
  return value;
}

function countFromBigint(value: bigint): number {
  return countFromDigits(value.toString(), 0);
}

function confirmationsRequired(): number {
  return countFromDigits(process.env.CONFIRMATIONS ?? "2", 2);
}

function timeoutMs(): number {
  return 10 * 60 * 1000;
}

export function intentMatches(intent: TxIntent, logs: { eventName: string; args: Record<string, unknown> }[]): boolean {
  if (intent.event === "Approval" || intent.event === "NativeTransfer" || intent.event === "Transfer") return true;
  return logs.some((log) => {
    if (log.eventName !== intent.event) return false;
    if (intent.stageIndex === undefined && intent.upToStage === undefined) return true;
    const stage = log.args.stage ?? log.args.upToStage;
    const index = typeof stage === "bigint" ? stage : null;
    if (index === null) return false;
    if (intent.event === "Funded") return intent.upToStage === undefined || index === BigInt(intent.upToStage);
    return intent.stageIndex === undefined || index === BigInt(intent.stageIndex);
  });
}

async function loadByKey(db: Database, key: string) {
  return (await db.select().from(chainTxs).where(eq(chainTxs.idempotencyKey, key)))[0];
}

export async function sendTx(db: Database, input: SendInput, port: ChainPort = defaultPort()) {
  const inserted = await db
    .insert(chainTxs)
    .values({
      projectId: input.projectId,
      stageId: input.stageId,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      chainId: input.chainId ?? SEPOLIA_CHAIN_ID,
      fromAddress: input.from,
      toAddress: input.to,
      calldata: input.data,
      valueMicro: input.valueMicro,
      status: "pending",
      attempts: 0,
      intent: JSON.stringify({ ...input.intent, accountName: input.accountName, valueWei: (input.valueWei ?? 0n).toString() }),
    })
    .onConflictDoNothing({ target: chainTxs.idempotencyKey })
    .returning();
  let row = inserted[0] ?? (await loadByKey(db, input.idempotencyKey));
  if (!row) throw new Error("The transaction was not recorded.");
  if (row.status === "failed" && row.txHash === null && row.attempts < 5) {
    const reset = await db
      .update(chainTxs)
      .set({ status: "pending", error: null })
      .where(eq(chainTxs.id, row.id))
      .returning();
    row = reset[0] ?? row;
  }
  if (OPEN.has(row.status) || row.status === "failed") return row;

  const claimed = await db
    .update(chainTxs)
    .set({ attempts: row.attempts + 1 })
    .where(and(eq(chainTxs.id, row.id), eq(chainTxs.status, "pending"), eq(chainTxs.attempts, row.attempts)))
    .returning();
  if (!claimed[0]) return (await loadByKey(db, input.idempotencyKey)) ?? row;
  row = claimed[0];

  const simulated = await port.simulate({ from: input.from, to: input.to, data: input.data, valueWei: input.valueWei });
  if (!simulated.ok) {
    const failed = await db
      .update(chainTxs)
      .set({ status: "failed", error: simulated.plain })
      .where(eq(chainTxs.id, row.id))
      .returning();
    return failed[0] ?? row;
  }

  const sent = await port.send({
    accountName: input.accountName,
    to: input.to,
    data: input.data,
    valueWei: input.valueWei,
    idempotencyKey: `${input.idempotencyKey}:a${row.attempts}`,
    feeBps: 10_000,
  });
  const submitted = await db
    .update(chainTxs)
    .set({
      status: "submitted",
      txHash: sent.hash,
      nonce: sent.nonce,
      submittedAt: new Date(),
    })
    .where(eq(chainTxs.id, row.id))
    .returning();
  const saved = submitted[0] ?? row;
  await enqueueJob(db, {
    kind: "confirm_tx",
    payload: { chainTxId: saved.id },
    dedupeKey: `confirm:${saved.id}:0`,
  });
  return saved;
}

export async function waitForTx(db: Database, chainTxId: string, port: ChainPort = defaultPort(), timeoutMs = 180_000) {
  const started = Date.now();
  let row = (await db.select().from(chainTxs).where(eq(chainTxs.id, chainTxId)))[0];
  while (row && row.status !== "confirmed" && row.status !== "failed" && Date.now() - started < timeoutMs) {
    row = (await confirmTx(db, chainTxId, port)) ?? row;
    if (row.status === "confirmed" || row.status === "failed") return row;
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  return row;
}

export async function confirmTx(db: Database, chainTxId: string, port: ChainPort = defaultPort(), now = Date.now()) {
  const row = (await db.select().from(chainTxs).where(eq(chainTxs.id, chainTxId)))[0];
  if (!row || !row.txHash) return row;
  if (row.status === "confirmed" || row.status === "failed") return row;
  const intent = JSON.parse(row.intent ?? "{}") as TxIntent;
  const receipt = await port.receipt(row.txHash as Hex);
  if (!receipt) {
    const submittedAt = row.submittedAt?.getTime() ?? now;
    if (now - submittedAt < timeoutMs()) {
      await enqueueJob(db, {
        kind: "confirm_tx",
        payload: { chainTxId: row.id },
        dedupeKey: `confirm:${row.id}:${row.attempts}:${Math.floor(now / 15_000)}`,
        runAt: new Date(now + 15_000),
      });
      return row;
    }
    return replaceOrFail(db, row, port);
  }
  if (receipt.confirmations < confirmationsRequired()) {
    await enqueueJob(db, {
      kind: "confirm_tx",
      payload: { chainTxId: row.id },
      dedupeKey: `confirm:${row.id}:conf:${receipt.confirmations}`,
      runAt: new Date(now + 15_000),
    });
    return row;
  }
  if (receipt.status !== "success" || !intentMatches(intent, receipt.logs)) {
    const failed = await db
      .update(chainTxs)
      .set({
        status: "failed",
        error: receipt.status !== "success" ? "The transaction reverted." : "The receipt did not match this payment.",
        blockNumber: receipt.blockNumber,
        confirmations: receipt.confirmations,
      })
      .where(eq(chainTxs.id, row.id))
      .returning();
    if (row.kind === "release_stage" && row.stageId) await markReleaseFailed(db, row.stageId);
    return failed[0] ?? row;
  }
  const confirmed = await db
    .update(chainTxs)
    .set({
      status: "confirmed",
      blockNumber: receipt.blockNumber,
      confirmations: receipt.confirmations,
      confirmedAt: new Date(now),
      error: null,
    })
    .where(eq(chainTxs.id, row.id))
    .returning();
  const saved = confirmed[0] ?? row;
  await applyConfirmation(db, saved, intent, receipt.logs);
  if (saved.projectId) {
    await enqueueJob(db, {
      kind: "reconcile_chain",
      payload: { projectId: saved.projectId },
      dedupeKey: `reconcile:${saved.projectId}:${saved.id}`,
    });
  }
  return saved;
}

async function replaceOrFail(db: Database, row: typeof chainTxs.$inferSelect, port: ChainPort) {
  const attempts = row.attempts + 1;
  if (!row.txHash || attempts > MAX_ATTEMPTS || row.nonce === null) {
    const failed = await db
      .update(chainTxs)
      .set({ status: "failed", error: "The transaction was not mined.", attempts })
      .where(eq(chainTxs.id, row.id))
      .returning();
    if (row.kind === "release_stage" && row.stageId) await markReleaseFailed(db, row.stageId);
    if (row.projectId) {
      await audit(db, {
        action: "admin.alert",
        entity: "chain_txs",
        entityId: row.id,
        projectId: row.projectId,
        actorKind: "system",
        reason: "A payment was not mined after three attempts.",
      });
    }
    return failed[0] ?? row;
  }
  const nonceNow = await port.pendingNonce(row.fromAddress as Hex);
  if (row.nonce === null || BigInt(nonceNow) !== row.nonce) {
    await enqueueJob(db, {
      kind: "confirm_tx",
      payload: { chainTxId: row.id },
      dedupeKey: `confirm:${row.id}:nonce:${nonceNow}`,
      runAt: new Date(Date.now() + 15_000),
    });
    return row;
  }
  const sent = await port.send({
    accountName: intentAccount(row),
    to: row.toAddress as Hex,
    data: (row.calldata ?? "0x") as Hex,
    idempotencyKey: `${row.idempotencyKey}:a${attempts}`,
    nonce: countFromBigint(row.nonce),
    feeBps: 10_000 + attempts * 2_000,
    valueWei: BigInt((JSON.parse(row.intent ?? "{}") as { valueWei?: string }).valueWei ?? "0"),
  });
  const replaced = await db
    .update(chainTxs)
    .set({
      status: "replaced",
      txHash: sent.hash,
      replacedHash: row.txHash,
      attempts,
      submittedAt: new Date(),
      error: null,
    })
    .where(eq(chainTxs.id, row.id))
    .returning();
  await enqueueJob(db, {
    kind: "confirm_tx",
    payload: { chainTxId: row.id },
    dedupeKey: `confirm:${row.id}:replaced:${attempts}`,
  });
  return replaced[0] ?? row;
}

function intentAccount(row: typeof chainTxs.$inferSelect): string {
  const intent = JSON.parse(row.intent ?? "{}") as TxIntent & { accountName?: string };
  if (!intent.accountName) throw new Error("The transaction has no account name for a replacement.");
  return intent.accountName;
}
