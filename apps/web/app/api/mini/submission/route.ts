import { getDatabase } from "@certa/db";
import { after } from "next/server";
import { rejectIfPaused } from "../../../../../../src/server/projects/pause";
import { apiError, apiJson, submissionInput, submissionOutput } from "../../../../lib/schemas";
import { sendCaptureSet } from "../../../../../../src/server/verify/capture";
import { withAuth } from "../../../../lib/with-auth";

export const maxDuration = 300;

export const POST = withAuth(
  async ({ db, userId, project, json }) => {
    const paused = rejectIfPaused(project.status);
    if (paused) return paused;
    const input = submissionInput.safeParse(json);
    if (!input.success) return apiError(400, "Choose a stage before sending the photos.");
    const sent = await sendCaptureSet(db, {
      projectId: project.id,
      workspaceId: project.workspaceId,
      userId,
      stageId: input.data.stageId,
      nonce: input.data.nonce,
    });
    if (!sent.ok) return apiError(422, sent.message);
    const submissionId = sent.submissionId;
    after(async () => {
      try {
        const { runVerifyStage } = await import("../../../../../../src/server/verify/run");
        await runVerifyStage(await getDatabase(), submissionId);
      } catch (error) {
        console.error(JSON.stringify({ msg: "verify stage", message: error instanceof Error ? error.message : "failed" }));
      }
    });
    return apiJson(submissionOutput, { ok: true, message: sent.message, submissionId: sent.submissionId });
  },
  { roles: ["contractor", "subcontractor"], assignedStage: true },
);
