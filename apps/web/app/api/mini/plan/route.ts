import { getDatabase, projects } from "@certa/db";
import { eq } from "drizzle-orm";

export async function POST() {
  const db = await getDatabase();
  const project = (await db.select().from(projects)).find((row) => row.name.startsWith("EM 22"));
  if (!project) return Response.json({ error: "No project." }, { status: 404 });
  const next = project.status === "paused" ? "active" : "paused";
  await db.update(projects).set({ status: next }).where(eq(projects.id, project.id));
  return Response.json({ status: next });
}
