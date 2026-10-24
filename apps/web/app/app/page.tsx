import { getDatabase, users } from "@certa/db";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { ProjectStart } from "../../components/project-start";
import { allows } from "../../../../src/server/auth/matrix";
import { isRole } from "../../../../src/server/auth/rbac";
import { openSession } from "../../../../src/server/auth/sessionOpen";
import { loadProject } from "../../lib/data";
import { isReviewStatus } from "../../lib/labels";
import { listMemberProjects } from "../../lib/member-projects";

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
  if (!userId) {
    if (process.env.DEMO_SEED === "true") {
      const data = await loadProject();
      if (data) {
        const mine = data.parties.find((party) => party.userId === data.user.id);
        const role = mine?.role === "main_contractor" ? "Contractor" : mine?.role === "consultant" ? "Consultant" : mine?.role === "subcontractor" ? "Subcontractor" : "Client";
        const review = data.stages.find((stage) => isReviewStatus(stage.status));
        const next = review ? `Review ${review.name}` : "Check the timeline";
        return (
          <article className="card">
            <p className="eyebrow">Projects</p>
            <h1>{data.project.name}</h1>
            <p>{data.project.siteLocation}</p>
            <p>Your role: {role}</p>
            <p>{data.project.status === "paused" ? "Paused" : "Active"}</p>
            <p>Next: {next}</p>
            <a href={`/app/p/${data.project.id}`}>Open project</a>
          </article>
        );
      }
    }
    return <ProjectStart initial={[]} signedIn={false} />;
  }
  const db = await getDatabase();
  const user = (await db.select().from(users).where(eq(users.id, userId)))[0];
  if (!user) return <ProjectStart initial={[]} signedIn={false} />;
  const rows = await listMemberProjects(db, user.id);
  const visible = rows.map((row) => ({
    projectId: row.project.id,
    name: row.project.name,
    role: row.role,
    canInvite: isRole(row.role) && allows(row.role, "invite_extra"),
  }));
  return <ProjectStart initial={visible} signedIn />;
}
