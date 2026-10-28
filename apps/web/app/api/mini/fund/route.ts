import { cdpConfigured } from "@certa/chain";
import { contractSummaries, contractVersions, getDatabase, recordPayment, stages, users } from "@certa/db";
import { koboFromUsdc } from "@certa/shared";
import { eq } from "drizzle-orm";
import type { Hex } from "viem";
import { chainUpToIndex } from "../../../../../../src/lib/fund-range";
import { supportEmailOrEmpty } from "../../../../../../src/lib/support";
import { notifyFundOutcome } from "../../../../../../src/bot/fundNotice";
import { ChainRejected, ConsultantRequired, fundAccepted } from "../../../../../../src/server/chain/flows";
import { chainFundLines } from "../../../../lib/escrow-quote";
import { rejectIfPaused } from "../../../../../../src/server/projects/pause";
import { apiError, apiJson, fundInput, fundOutput } from "../../../../lib/schemas";
import { attachCookies } from "../../../../../../src/server/auth/authenticate";
import { failureResponse } from "../../../../../../src/server/auth/errors";
import { requireMember, runAsUser } from "../../../../../../src/server/auth/rbac";
import { lockReadiness } from "../../../../../../src/server/chain/readiness";
import { requireUser, withAuth } from "../../../../lib/with-auth";

export const maxDuration = 300;

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
    const chainUpTo = chainUpToIndex(rows, input.data.upToStage);
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
    const quoted = await chainFundLines(
      project.escrowAddress ?? "",
      rows.map((stage) => ({ name: stage.name, stageIndex: stage.stageIndex })),
      project.fxRateLocked,
    ).catch(() => null);
    const priced = quoted ?? rows.map((stage) => ({ name: stage.name, usdc: stage.amountUsdc, kobo: stage.amountNgnKobo }));
    let amountUsdc = priced.reduce((sum, stage) => sum + stage.usdc, 0n);
    const acceptedRate = versions.find((row) => row.status === "accepted");
    const rateKobo = project.fxRateLocked > 0n ? project.fxRateLocked : (acceptedRate?.koboPerUsdc ?? 0n);
    const summedKobo = priced.reduce((sum, stage) => sum + stage.kobo, 0n);
    const nairaOf = (units: bigint) => (rateKobo > 0n ? koboFromUsdc(units, rateKobo) : summedKobo);
    let amountNgnKobo = nairaOf(amountUsdc);
    let sentHash: Hex | null = null;
    let escrowFromChain = "";
    let locked: "pending" | "confirmed" = "pending";
    const payInNaira = input.data.currency === "ngn";
    const accepted = acceptedRate;
    if (!payInNaira && accepted) {
      if (!cdpConfigured()) return apiError(503, "The payment account is not configured.");
      try {
        const sent = await fundAccepted(db, {
          projectId: project.id,
          upToStage: chainUpTo,
          idempotencyKey: input.data.idempotencyKey,
        });
        sentHash = (sent.tx.txHash as Hex | null) ?? null;
        escrowFromChain = sent.escrow;
        locked = sent.tx.status === "confirmed" ? "confirmed" : "pending";
        amountUsdc = sent.amount;
        amountNgnKobo = nairaOf(sent.amount);
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
          supportEmail: supportEmailOrEmpty(),
          idempotencyKey: input.data.idempotencyKey,
        }).catch(() => undefined);
        return apiError(status, message);
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
            supportEmail: supportEmailOrEmpty(),
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

export async function GET(request: Request) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? "";
    const upTo = Number(url.searchParams.get("upToStage") ?? "0");
    const db = await getDatabase();
    const body = await runAsUser({ db, userId: auth.user.id }, async () => {
      await requireMember(projectId, ["client"]);
      const rows = await db.select().from(stages).where(eq(stages.projectId, projectId));
      const check = await lockReadiness(db, { projectId, upToStage: chainUpToIndex(rows, Number.isFinite(upTo) ? upTo : 0) });
      return { ...check, neededMicro: check.neededMicro.toString(), heldMicro: check.heldMicro.toString() };
    });
    return attachCookies(Response.json(body), auth.setCookies);
  } catch (error) {
    return failureResponse(error);
  }
}
