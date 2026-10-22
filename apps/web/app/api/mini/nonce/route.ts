import { stages } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { apiError, apiJson, nonceInput, nonceOutput } from "../../../../lib/schemas";
import { issueCaptureNonce } from "../../../../../../src/server/verify/capture";
import { withAuth } from "../../../../lib/with-auth";

export const POST = withAuth(
  async ({ db, userId, project, json }) => {
    const input = nonceInput.safeParse(json);
    if (!input.success) return apiError(400, "Choose a stage before opening the camera.");
    const stage = (await db.select().from(stages).where(and(eq(stages.id, input.data.stageId), eq(stages.projectId, project.id))))[0];
    if (!stage) return apiError(404, "That stage is not on this project.");
    const issued = await issueCaptureNonce(db, { projectId: project.id, userId, stageId: stage.id });
    if ("error" in issued) return apiError(issued.status, issued.error);
    return apiJson(nonceOutput, issued);
  },
  { roles: ["contractor", "subcontractor"], assignedStage: true },
);
