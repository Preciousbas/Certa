import { cdpConfigured } from "@certa/chain";
import { contractSummaries, contractVersions, recordPayment, stages, users } from "@certa/db";
import { koboFromUsdc } from "@certa/shared";
import { eq } from "drizzle-orm";
import type { Hex } from "viem";
import { notifyFundOutcome } from "../../../../../../src/bot/fundNotice";
import { ChainRejected, ConsultantRequired, fundAccepted } from "../../../../../../src/server/chain/flows";
import { broadcastClientFund } from "../../../../lib/chain-fund";
import { chainFundLines } from "../../../../lib/escrow-quote";
import { rejectIfPaused } from "../../../../../../src/server/projects/pause";
import { apiError, apiJson, fundInput, fundOutput } from "../../../../lib/schemas";
import { withAuth } from "../../../../lib/with-auth";

export const POST = withAuth(
  async ({ db, project, json, userId }) => {
    const paused = rejectIfPaused(project.status);
    if (paused) return paused;
    const input = fundInput.safeParse(json);
    if (!input.success) return apiError(400, "The amount and the idempotency key are required.");
    const client = (await db.select().from(users).where(eq(users.id, userId)))[0];
    const rows = (await db.select().from(stages).where(eq(stages.projectId, project.id)))
      .filter((stage) => stage.stageIndex <= input.data.upToStage)
      .sort((a, b) => a.stageIndex - b.stageIndex);
    if (rows.length === 0) return apiError(400, "No stages fall in that range.");
    const versions = await db.select().from(contractVersions).where(eq(contractVersions.projectId, project.id));
    if (versions.length > 0) {
      const current = versions.find((row) => row.id === project.currentContractVersionId) ?? versions.find((row) => row.status === "accepted");
      if (!current || current.status !== "accepted") {
        return apiError(409, "Both sides accept the schedule before money can be locked.");
      }
    } else if (project.termsHash !== "seeded-terms") {
      const summaries = await db.select().from(contractSummaries).where(eq(contractSummaries.projectId, project.id));
      const latest = summaries.sort((a, b) => b.version - a.version)[0];
      if (!latest?.acceptedByClientAt || !latest?.acceptedByContractorAt) {
        return apiError(409, "Both sides accept the schedule before money can be locked.");
      }
    }
    const rate = { koboPerUsdc: project.fxRateLocked };
    const quoted = await chainFundLines(
      project.escrowAddress ?? "",
      rows.map((stage) => ({ name: stage.name, stageIndex: stage.stageIndex })),
      rate.koboPerUsdc,
    ).catch(() => null);
    const priced = quoted ?? rows.map((stage) => ({ name: stage.name, usdc: stage.amountUsdc, kobo: stage.amountNgnKobo }));
    let amountUsdc = priced.reduce((sum, stage) => sum + stage.usdc, 0n);
    let amountNgnKobo = rate ? koboFromUsdc(amountUsdc, rate.koboPerUsdc) : priced.reduce((sum, stage) => sum + stage.kobo, 0n);
    let sentHash: Hex | null = null;
    let escrowFromChain = "";
    let locked: "pending" | "confirmed" = "pending";
    const escrow = project.escrowAddress ?? "";
    const payInNaira = input.data.currency === "ngn";
    const accepted = versions.find((row) => row.status === "accepted");
    if (!payInNaira && accepted) {
      if (!cdpConfigured()) return apiError(503, "The payment account is not configured.");
      try {
        const sent = await fundAccepted(db, {
          projectId: project.id,
          upToStage: input.data.upToStage,
          idempotencyKey: input.data.idempotencyKey,
        });
        sentHash = (sent.tx.txHash as Hex | null) ?? null;
        escrowFromChain = sent.escrow;
        locked = sent.tx.status === "confirmed" ? "confirmed" : "pending";
        amountUsdc = sent.amount;
        if (rate) amountNgnKobo = koboFromUsdc(sent.amount, rate.koboPerUsdc);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The fund transaction reverted.";
        const status = error instanceof ConsultantRequired ? 409 : error instanceof ChainRejected ? 400 : 502;
        await notifyFundOutcome(db, {
          outcome: "failed",
          projectId: project.id,
          projectName: project.name,
          clientUserId: userId,
          clientName: client?.name ?? "The client",
          amountKobo: 0n,
          fromStage: (rows[0]?.stageIndex ?? 0) + 1,
          toStage: (rows[rows.length - 1]?.stageIndex ?? 0) + 1,
          explorerLink: "",
          plainReason: message,
          supportEmail: process.env.SUPPORT_EMAIL || "support@example.com",
          idempotencyKey: input.data.idempotencyKey,
        }).catch(() => undefined);
        return apiError(status, message);
      }
    } else if (!payInNaira && /^0x[a-fA-F0-9]{40}$/.test(escrow) && process.env.DEPLOYER_PRIVATE_KEY) {
      try {
        const sent = await broadcastClientFund(escrow as Hex, input.data.upToStage);
        sentHash = sent.hash;
        locked = "confirmed";
        amountUsdc = sent.amount;
        if (rate) amountNgnKobo = koboFromUsdc(sent.amount, rate.koboPerUsdc);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const plainReason = message === "The client wallet does not hold enough USDC." || message === "That range has nothing left to fund." ? message : "The fund transaction reverted.";
        await notifyFundOutcome(db, {
          outcome: "failed",
          projectId: project.id,
          projectName: project.name,
          clientUserId: userId,
          clientName: client?.name ?? "The client",
          amountKobo: 0n,
          fromStage: (rows[0]?.stageIndex ?? 0) + 1,
          toStage: (rows[rows.length - 1]?.stageIndex ?? 0) + 1,
          explorerLink: "",
          plainReason,
          supportEmail: process.env.SUPPORT_EMAIL || "support@example.com",
          idempotencyKey: input.data.idempotencyKey,
        }).catch(() => undefined);
        return apiError(502, plainReason);
      }
    }
    const payment = await recordPayment(db, {
      projectId: project.id,
      workspaceId: project.workspaceId,
      kind: payInNaira ? "naira" : "stage",
      amountUsdc,
      amountNgnKobo,
      idempotencyKey: input.data.idempotencyKey,
      txHash: sentHash ?? undefined,
      status: locked,
    });
    const rawTx = payment.payment.txHash ?? "";
    const rawEscrow = escrowFromChain || project.escrowAddress || "";
    const txHash = /^0x[a-fA-F0-9]{64}$/.test(rawTx) ? rawTx : null;
    const escrowAddress = /^0x[a-fA-F0-9]{40}$/.test(rawEscrow) ? rawEscrow : null;
    const fromStage = (rows[0]?.stageIndex ?? 0) + 1;
    const toStage = (rows[rows.length - 1]?.stageIndex ?? 0) + 1;
    const notice =
      locked === "confirmed"
        ? await notifyFundOutcome(db, {
            outcome: "confirmed",
            projectId: project.id,
            projectName: project.name,
            clientUserId: userId,
            clientName: client?.name ?? "The client",
            amountKobo: amountNgnKobo,
            fromStage,
            toStage,
            explorerLink: txHash ? `https://sepolia.etherscan.io/tx/${txHash}` : "pending",
            plainReason: "",
            supportEmail: process.env.SUPPORT_EMAIL || "support@example.com",
            idempotencyKey: input.data.idempotencyKey,
          }).catch(() => ({ contractorNotified: false }))
        : { contractorNotified: false };
    return apiJson(fundOutput, {
      ok: true,
      created: payment.created,
      paymentId: payment.payment.id,
      status: locked,
      rail: payment.payment.kind === "naira" ? "ngn" : "usdc",
      amountUsdc: payment.payment.amountUsdc.toString(),
      amountNgnKobo: payment.payment.amountNgnKobo.toString(),
      txHash,
      escrowAddress,
      contractorNotified: notice.contractorNotified,
      stages: rows
        .sort((a, b) => a.stageIndex - b.stageIndex)
        .map((stage, index) => ({
          name: stage.name,
          amountNgnKobo: (priced[index]?.kobo ?? stage.amountNgnKobo).toString(),
          amountUsdc: (priced[index]?.usdc ?? stage.amountUsdc).toString(),
        })),
    });
  },
  { roles: ["client"] },
);
