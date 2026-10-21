import { getDatabase, memberships, projects, users } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { ProjectStart } from "../../components/project-start";
import { allows, type Role } from "../../../../src/server/auth/matrix";
import { isRole } from "../../../../src/server/auth/rbac";
import { openSession } from "../../../../src/server/auth/sessionOpen";

export default async function ProjectsPage() {
  const jar = await cookies();
  const token = jar.get("certa_session")?.value;
  let userId = "";
  if (token) {
    try {
      userId = (await openSession(token)).sub;
    } catch {
      userId = "";
    }
  }
  if (!userId) return <ProjectStart initial={[]} signedIn={false} />;
  const db = await getDatabase();
  const user = (await db.select().from(users).where(eq(users.id, userId)))[0];
  if (!user) return <ProjectStart initial={[]} signedIn={false} />;
  const rows = await db
    .select({ projectId: memberships.projectId, role: memberships.role, name: projects.name })
    .from(memberships)
    .innerJoin(projects, eq(projects.id, memberships.projectId))
    .where(and(eq(memberships.userId, user.id), eq(memberships.status, "active")));
  const visible = rows.flatMap((row) => {
    if (!isRole(row.role)) return [];
    const role: Role = row.role;
    return [{ projectId: row.projectId, name: row.name, role, canInvite: allows(role, "invite_extra") }];
  });
  return <ProjectStart initial={visible} signedIn />;
}
