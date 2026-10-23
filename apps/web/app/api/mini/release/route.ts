import { cdpConfigured } from "@certa/chain";
import { approvals, payments, stages } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { ChainRejected, releaseStageTx } from "../../../../../../src/server/chain/flows";
import { rejectIfPaused } from "../../../../../../src/server/projects/pause";
import { apiError, apiJson, fundOutput, releaseInput } from "../../../../lib/schemas";
import { withAuth } from "../../../../lib/with-auth";

export const POST = withAuth(
  async ({ db, project, json }) => {
    const paused = rejectIfPaused(project.status);
    if (paused) return paused;
    const input = releaseInput.safeParse(json);
    if (!input.success) return apiError(400, "The stage and the idempotency key are required.");
    const existing = (await db.select().from(payments).where(eq(payments.idempotencyKey, input.data.idempotencyKey)))[0];
    if (existing) {
      const rawTx = existing.txHash ?? "";
      const rawEscrow = project.escrowAddress ?? "";
      return apiJson(fundOutput, {
        ok: true,
        created: false,
        paymentId: existing.id,
        status: /^0x[a-fA-F0-9]{64}$/.test(rawTx) ? "confirmed" : "pending",
        rail: existing.kind === "naira" ? "ngn" : "usdc",
        amountUsdc: existing.amountUsdc.toString(),
        amountNgnKobo: existing.amountNgnKobo.toString(),
        txHash: /^0x[a-fA-F0-9]{64}$/.test(rawTx) ? rawTx : null,
        escrowAddress: /^0x[a-fA-F0-9]{40}$/.test(rawEscrow) ? rawEscrow : null,
        contractorNotified: false,
        stages: [],
      });
    }
    if (!cdpConfigured() || !project.escrowAddress) return apiError(409, "Release stays locked until the checks pass.");
    const stage = (await db.select().from(stages).where(and(eq(stages.id, input.data.stageId), eq(stages.projectId, project.id))))[0];
    const approval = (await db.select().from(approvals).where(eq(approvals.stageId, input.data.stageId))).find(
      (row) => row.decision === "approved_release" || row.decision === "approve",
    );
    if (!stage || !approval) return apiError(409, "Release stays locked until the checks pass.");
    try {
      const sent = await releaseStageTx(db, {
        projectId: project.id,
        stageId: stage.id,
        approvalId: approval.id,
        stageIndex: stage.onChainIdx,
        amountMicro: stage.amountUsdc,
        capMicro: project.spendingCapUsdc,
      });
      return apiJson(fundOutput, {
        ok: true,
        created: true,
        paymentId: approval.id,
        status: sent.status === "confirmed" ? "confirmed" : "pending",
        rail: "usdc",
        amountUsdc: stage.amountUsdc.toString(),
        amountNgnKobo: stage.amountNgnKobo.toString(),
        txHash: sent.txHash && /^0x[a-fA-F0-9]{64}$/.test(sent.txHash) ? sent.txHash : null,
        escrowAddress: /^0x[a-fA-F0-9]{40}$/.test(project.escrowAddress) ? project.escrowAddress : null,
        contractorNotified: false,
        stages: [],
      });
    } catch (error) {
      const message = error instanceof ChainRejected ? error.message : "The payment didn't go through.";
      return apiError(400, message);
    }
  },
  { roles: ["client"] },
);
