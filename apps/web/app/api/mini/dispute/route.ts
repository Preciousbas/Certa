import { cdpConfigured } from "@certa/chain";
import { stages } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { ChainRejected, disputeTx } from "../../../../../../src/server/chain/flows";
import { apiError, disputeInput } from "../../../../lib/schemas";
import { withAuth } from "../../../../lib/with-auth";

export const POST = withAuth(
  async ({ db, project, roles, json }) => {
    const input = disputeInput.safeParse(json);
    if (!input.success) return apiError(400, "A dispute needs a reason.");
    if (!cdpConfigured() || !project.escrowAddress) return apiError(409, "That stage cannot be disputed from here yet.");
    const stage = (await db.select().from(stages).where(and(eq(stages.id, input.data.stageId), eq(stages.projectId, project.id))))[0];
    const from = roles.includes("client") ? "client" : roles.includes("contractor") ? "contractor" : null;
    if (!stage || !from || input.data.reason.trim().length < 10) return apiError(409, "That stage cannot be disputed from here yet.");
    try {
      const sent = await disputeTx(db, {
        projectId: project.id,
        stageId: stage.id,
        stageIndex: stage.onChainIdx,
        reason: input.data.reason.trim(),
        from,
      });
      return Response.json({ ok: true, txHash: sent.txHash });
    } catch (error) {
      return apiError(400, error instanceof ChainRejected ? error.message : "The payment didn't go through.");
    }
  },
  { roles: ["client", "contractor"] },
);
