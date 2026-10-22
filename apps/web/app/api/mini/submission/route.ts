import { apiError, apiJson, submissionInput, submissionOutput } from "../../../../lib/schemas";
import { sendCaptureSet } from "../../../../../../src/server/verify/capture";
import { withAuth } from "../../../../lib/with-auth";

export const POST = withAuth(
  async ({ db, userId, project, json }) => {
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
    return apiJson(submissionOutput, { ok: true, message: sent.message, submissionId: sent.submissionId });
  },
  { roles: ["contractor", "subcontractor"], assignedStage: true },
);
