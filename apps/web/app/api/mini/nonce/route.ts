import { captureNonces, sha256Hex, stages } from "@certa/db";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { apiError, apiJson, nonceInput, nonceOutput } from "../../../../lib/schemas";
import { withAuth } from "../../../../lib/with-auth";

const NONCE_TTL_MS = 5 * 60 * 1000;

export const POST = withAuth(
  async ({ db, userId, project, json }) => {
    const input = nonceInput.safeParse(json);
    if (!input.success) return apiError(400, "Choose a stage before opening the camera.");
    const stage = (
      await db.select().from(stages).where(and(eq(stages.id, input.data.stageId), eq(stages.projectId, project.id)))
    )[0];
    if (!stage) return apiError(404, "That stage is not on this project.");
    const nonce = randomBytes(16).toString("hex");
    await db.insert(captureNonces).values({
      projectId: project.id,
      userId,
      stageId: stage.id,
      nonceHash: sha256Hex(nonce),
      expiresAt: new Date(Date.now() + NONCE_TTL_MS),
    });
    return apiJson(nonceOutput, { nonce });
  },
  { roles: ["contractor", "subcontractor"] },
);
