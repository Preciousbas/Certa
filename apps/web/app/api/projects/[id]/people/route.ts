import { memberships, stages, users } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { canOfferSkip } from "../../../../../../../src/server/projects/approvalMode";
import { withProject } from "../../../../../lib/project-route";

export const runtime = "nodejs";

const ROLES = ["client", "consultant", "contractor", "subcontractor", "viewer"] as const;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withProject(request, id, [...ROLES], async ({ db, project, role }) => {
    const rows = await db
      .select({ name: users.name, role: memberships.role, notifyChannel: memberships.notifyChannel })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.projectId, project.id), eq(memberships.status, "active")));
    const stageRows = await db.select().from(stages).where(eq(stages.projectId, project.id));
    const locked = Boolean(project.escrowAddress) || stageRows.some((row) => row.funded);
    return Response.json({
      project: project.name,
      role,
      approvalMode: project.approvalMode,
      locked,
      canSkip: role === "client" && (await canOfferSkip(db, project)),
      people: rows,
    });
  });
}
