import { projects } from "@certa/db";
import { eq } from "drizzle-orm";
import { apiError, apiJson, planInput, planOutput } from "../../../../lib/schemas";
import { withAuth } from "../../../../lib/with-auth";

export const POST = withAuth(
  async ({ db, project, json }) => {
    const input = planInput.safeParse(json);
    if (!input.success) return apiError(400, "This project is missing.");
    const next = project.status === "paused" ? "active" : "paused";
    await db.update(projects).set({ status: next, updatedAt: new Date() }).where(eq(projects.id, project.id));
    return apiJson(planOutput, { status: next });
  },
  { roles: ["client"] },
);
