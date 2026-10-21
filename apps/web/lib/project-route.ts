import { getDatabase, projects, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { attachCookies, authenticate } from "../../../src/server/auth/authenticate";
import { assertCsrf } from "../../../src/server/auth/csrf";
import { failureResponse } from "../../../src/server/auth/errors";
import { requireMember, runAsUser, type Role } from "../../../src/server/auth/rbac";

export async function withProject(
  request: Request,
  projectId: string,
  roles: Role[],
  handler: (ctx: { db: Database; userId: string; role: Role; project: typeof projects.$inferSelect }) => Promise<Response>,
): Promise<Response> {
  const db = await getDatabase();
  try {
    const auth = await authenticate(request, db);
    if (auth.via === "session") assertCsrf(request, auth.csrf);
    const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
    if (!project) return attachCookies(Response.json({ error: "not_found", message: "That project is not available." }, { status: 404 }), auth.setCookies);
    const response = await runAsUser({ db, userId: auth.user.id }, async () => {
      const { membership } = await requireMember(projectId, roles);
      const role = membership.role as Role;
      return handler({ db, userId: auth.user.id, role, project });
    });
    return attachCookies(response, auth.setCookies);
  } catch (error) {
    return failureResponse(error);
  }
}
