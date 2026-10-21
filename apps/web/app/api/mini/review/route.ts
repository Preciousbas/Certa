import { approvals, stages } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { payForWeather } from "../../../../lib/x402-buyer";
import { apiError, apiJson, reviewInput, reviewOutput } from "../../../../lib/schemas";
import { withAuth } from "../../../../lib/with-auth";

export const POST = withAuth(
  async ({ db, userId, project, json, request }) => {
    const input = reviewInput.safeParse(json);
    if (!input.success) return apiError(400, "Choose a stage and a decision.");
    if (input.data.decision === "reject" && !input.data.reason?.trim()) return apiError(400, "A no needs a reason.");
    const stage = (await db.select().from(stages).where(and(eq(stages.id, input.data.stageId), eq(stages.projectId, project.id))))[0];
    if (!stage || stage.status !== "submitted") return apiError(409, "That stage is not in review.");
    if (stage.pour) {
      try {
        await payForWeather(new URL(request.url).origin);
      } catch {
        // A missing payer key or a failed settle leaves no receipt.
      }
    }
    await db.insert(approvals).values({
      projectId: project.id,
      workspaceId: project.workspaceId,
      stageId: stage.id,
      byUserId: userId,
      decision: input.data.decision,
      reason: input.data.reason?.trim() || null,
    });
    return apiJson(reviewOutput, { ok: true, recorded: true, moneyMoved: false });
  },
  { roles: ["consultant"] },
);
