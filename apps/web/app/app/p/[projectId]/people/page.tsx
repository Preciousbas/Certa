import { getDatabase, memberships, projects, users } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { openSession } from "../../../../../../../src/server/auth/sessionOpen";
import { InviteForm } from "../../../../../components/invite-form";

export default async function PeoplePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
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
  if (!userId) return <p>Sign in from Telegram.</p>;
  const db = await getDatabase();
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
  if (!project) return <p>Something went wrong loading people. Try again.</p>;
  const mine = (
    await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.projectId, projectId), eq(memberships.userId, userId), eq(memberships.status, "active")))
  )[0];
  if (!mine) return <p>Sign in from Telegram.</p>;
  const rows = await db
    .select({ name: users.name, role: memberships.role, notifyChannel: memberships.notifyChannel })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.projectId, projectId), eq(memberships.status, "active")));
  return (
    <div>
      <p className="eyebrow">People</p>
      <h1>{project.name}</h1>
      {rows.length === 0 ? <p className="muted">Nobody has joined this project yet.</p> : null}
      <InviteForm projectId={projectId} />
      <ul>
        {rows.map((row) => (
          <li key={`${row.role}-${row.name}`}>
            {row.name} · {row.role}
            {row.notifyChannel === "blocked" ? " · Bot blocked" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
