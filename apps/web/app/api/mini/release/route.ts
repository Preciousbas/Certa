import { payments } from "@certa/db";
import { eq } from "drizzle-orm";
import { apiError, apiJson, fundOutput, releaseInput } from "../../../../lib/schemas";
import { withAuth } from "../../../../lib/with-auth";

export const POST = withAuth(
  async ({ db, project, json }) => {
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
    return apiError(409, "Release stays locked until the checks pass.");
  },
  { roles: ["client"] },
);
