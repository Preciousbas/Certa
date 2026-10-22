import { stages } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { enqueuePrePour } from "../../../../../../src/server/x402/prepour";
import { stageNeedsWeather } from "../../../../../../src/server/x402/gate";
import { apiError, projectIdField } from "../../../../lib/schemas";
import { withAuth } from "../../../../lib/with-auth";

const bodySchema = z.object({ projectId: projectIdField, stageId: projectIdField }).strict();

export const POST = withAuth(
  async ({ db, project, json }) => {
    const input = bodySchema.safeParse(json);
    if (!input.success) return apiError(400, "Choose a stage.");
    const stage = (
      await db.select().from(stages).where(and(eq(stages.id, input.data.stageId), eq(stages.projectId, project.id)))
    )[0];
    if (!stage || !stageNeedsWeather(stage)) return apiError(409, "This stage does not need a weather check.");
    await enqueuePrePour(db, { projectId: project.id, stageId: stage.id });
    return Response.json({ ok: true, queued: true });
  },
  { roles: ["contractor", "subcontractor"] },
);
