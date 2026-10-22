import {
  chainTxs,
  projects,
  usageLedger,
  workspaces,
  x402Spend,
  type Database,
} from "@certa/db";
import { and, eq, gte, inArray } from "drizzle-orm";
import { isTxHash } from "@certa/chain";
import { audit } from "../audit.js";
import { BASE_SEPOLIA_CHAIN, chainIdFromCaip, lagosMonthStart, remainingAllowance } from "./gate.js";

export async function allowanceState(db: Database, projectId: string): Promise<{
  workspaceId: string;
  allowanceMicro: bigint;
  spentMicro: bigint;
  gasMicro: bigint;
  left: bigint;
} | null> {
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
  if (!project) return null;
  const workspace = (await db.select().from(workspaces).where(eq(workspaces.id, project.workspaceId)))[0];
  if (!workspace) return null;
  const start = lagosMonthStart();
  const projectIds = (await db.select({ id: projects.id }).from(projects).where(eq(projects.workspaceId, workspace.id))).map(
    (row) => row.id,
  );
  const spends = projectIds.length
    ? await db
        .select()
        .from(x402Spend)
        .where(and(inArray(x402Spend.projectId, projectIds), gte(x402Spend.createdAt, start)))
    : [];
  const spentMicro = spends.reduce((sum, row) => sum + row.amountMicro, 0n);
  const fees = await db
    .select()
    .from(usageLedger)
    .where(and(eq(usageLedger.workspaceId, workspace.id), eq(usageLedger.kind, "network_fee"), gte(usageLedger.createdAt, start)));
  const gasMicro = fees.reduce((sum, row) => sum + row.amountUsdc, 0n);
  const allowanceMicro = workspace.allowanceMicro > 0n ? workspace.allowanceMicro : workspace.x402AllowanceUsdc;
  return {
    workspaceId: workspace.id,
    allowanceMicro,
    spentMicro,
    gasMicro,
    left: remainingAllowance({ allowanceMicro, spentMicro, gasMicro }),
  };
}

export async function recentWeatherSpend(db: Database, stageId: string, now = Date.now()): Promise<boolean> {
  const rows = await db.select().from(x402Spend).where(eq(x402Spend.stageId, stageId));
  return rows.some(
    (row) => row.endpoint.includes("weather") && now - row.createdAt.getTime() < 12 * 60 * 60 * 1000,
  );
}

export async function recordX402Payment(
  db: Database,
  input: {
    projectId: string;
    stageId: string;
    workspaceId: string;
    endpoint: string;
    amountMicro: bigint;
    txHash: string;
    network: string;
    fromAddress: string;
    toAddress: string;
    resultSummary: string;
    paymentResponse: Record<string, unknown>;
  },
): Promise<{ txHash: `0x${string}` } | null> {
  if (!isTxHash(input.txHash)) return null;
  const chainId = chainIdFromCaip(input.network) ?? BASE_SEPOLIA_CHAIN;
  const existing = (await db.select().from(chainTxs).where(eq(chainTxs.txHash, input.txHash)))[0];
  const chain = existing
    ? existing
    : (
        await db
          .insert(chainTxs)
          .values({
            projectId: input.projectId,
            stageId: input.stageId,
            kind: "x402_payment",
            idempotencyKey: `x402_payment:${input.txHash}`,
            chainId,
            fromAddress: input.fromAddress,
            toAddress: input.toAddress,
            valueMicro: input.amountMicro,
            status: "confirmed",
            txHash: input.txHash,
            confirmations: 1,
            submittedAt: new Date(),
            confirmedAt: new Date(),
          })
          .onConflictDoNothing()
          .returning()
      )[0] ?? (await db.select().from(chainTxs).where(eq(chainTxs.txHash, input.txHash)))[0];
  if (!chain) return null;
  const already = (await db.select().from(x402Spend).where(eq(x402Spend.chainTxId, chain.id)))[0];
  const spend =
    already ??
    (
      await db
        .insert(x402Spend)
        .values({
          projectId: input.projectId,
          stageId: input.stageId,
          endpoint: input.endpoint,
          amountMicro: input.amountMicro,
          chainTxId: chain.id,
          paymentResponse: input.paymentResponse,
          resultSummary: input.resultSummary,
        })
        .returning()
    )[0];
  if (!spend) return null;
  await audit(db, {
    action: "x402_payment",
    entity: "x402_spend",
    entityId: spend.id,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    actorKind: "agent",
    after: { txHash: input.txHash, amountMicro: input.amountMicro.toString(), network: input.network },
    reason: input.resultSummary,
  });
  return { txHash: input.txHash };
}
