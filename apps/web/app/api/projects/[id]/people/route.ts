import { memberships, users } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { withProject } from "../../../../../lib/project-route";

export const runtime = "nodejs";

const ROLES = ["client", "consultant", "contractor", "subcontractor", "viewer"] as const;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withProject(request, id, [...ROLES], async ({ db, project }) => {
    const rows = await db
      .select({ name: users.name, role: memberships.role, notifyChannel: memberships.notifyChannel })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.projectId, project.id), eq(memberships.status, "active")));
    return Response.json({ project: project.name, people: rows });
  });
}
