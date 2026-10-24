import { memberships, projects, type Database } from "@certa/db";
import { and, eq } from "drizzle-orm";

export async function listMemberProjects(db: Database, userId: string) {
  const rows = await db
    .select({ project: projects, role: memberships.role })
    .from(memberships)
    .innerJoin(projects, eq(projects.id, memberships.projectId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")));
  const seen = new Set<string>();
  const list: { project: (typeof rows)[number]["project"]; role: string }[] = [];
  for (const row of rows) {
    if (seen.has(row.project.id)) continue;
    seen.add(row.project.id);
    list.push(row);
  }
  return list;
}
