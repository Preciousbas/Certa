import { approvals, stages } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { payForWeather } from "../../../../lib/x402-buyer";
import { apiError, apiJson, reviewInput, reviewOutput } from "../../../../lib/schemas";
import { applyAiOverride } from "../../../../../../src/server/verify/override";
import { defaultSubmitStage } from "../../../../../../src/server/verify/run";
import { withAuth } from "../../../../lib/with-auth";

export const POST = withAuth(
  async ({ db, userId, project, json, request }) => {
    const input = reviewInput.safeParse(json);
    if (!input.success) return apiError(400, "Choose a stage and a decision.");
    if (input.data.decision === "reject" && !input.data.reason?.trim()) return apiError(400, "A no needs a reason.");
    const stage = (await db.select().from(stages).where(and(eq(stages.id, input.data.stageId), eq(stages.projectId, project.id))))[0];
    if (!stage) return apiError(409, "That stage is not in review.");
    if (stage.status === "ai_fail" || stage.status === "needs_more_evidence") {
      const reason = input.data.reason?.trim() ?? "";
      if (input.data.decision !== "approve" || reason.length < 20) {
        return apiError(400, "Write at least 20 characters so the override is on the record.");
      }
      try {
        await applyAiOverride(db, {
          projectId: project.id,
          workspaceId: project.workspaceId,
          stageId: stage.id,
          userId,
          reason,
          submit: defaultSubmitStage,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The override was not recorded.";
        return apiError(409, message);
      }
      return apiJson(reviewOutput, { ok: true, recorded: true, moneyMoved: false });
    }
    if (stage.status !== "submitted") return apiError(409, "That stage is not in review.");
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
