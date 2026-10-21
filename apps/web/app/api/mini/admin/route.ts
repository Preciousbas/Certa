import { addTestUsdc, ChainRejected } from "../../../../../../src/server/chain/flows";
import { apiError, planInput } from "../../../../lib/schemas";
import { withAuth } from "../../../../lib/with-auth";

export const POST = withAuth(
  async ({ db, project, json }) => {
    const body = json as { action?: string; amountMicro?: string };
    if (body?.action === "add_test_money") {
      try {
        const amount = body.amountMicro && /^\d+$/.test(body.amountMicro) ? BigInt(body.amountMicro) : 20_000_000n;
        const sent = await addTestUsdc(db, project.id, amount);
        return Response.json({ ok: true, label: "Add test money", txHash: sent.txHash });
      } catch (error) {
        return apiError(400, error instanceof ChainRejected ? error.message : "Test money was not sent.");
      }
    }
    const input = planInput.safeParse(json);
    if (!input.success) return apiError(400, "This project is missing.");
    return apiError(409, "The desk has nothing to change.");
  },
  { platformAdmin: true },
);
