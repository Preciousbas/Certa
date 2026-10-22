import { VariationError, decideVariation } from "../../../../../../src/server/changes/propose";
import { apiError } from "../../../../lib/schemas";
import { withAuth } from "../../../../lib/with-auth";
import { changeInput } from "../../../../lib/schemas";

export const POST = withAuth(
  async ({ db, project, json, userId }) => {
    const input = changeInput.safeParse(json);
    if (!input.success) return apiError(400, input.error.issues[0]?.message ?? "A no needs a reason.");
    try {
      await decideVariation(db, {
        projectId: project.id,
        changeId: input.data.changeId,
        actorUserId: userId,
        accept: input.data.decision === "accept",
        reason: input.data.reason,
      });
    } catch (error) {
      const message = error instanceof VariationError ? error.message : "That change is not waiting on you.";
      return apiError(409, message);
    }
    return Response.json({ ok: true });
  },
  { roles: ["client", "contractor"] },
);
