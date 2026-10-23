import { documents } from "@certa/db";
import { eq } from "drizzle-orm";
import { runDocumentJobs } from "../../../../../../../src/server/intake/run";
import { documentChip } from "../../../../../../../src/server/intake/status";
import { withProject } from "../../../../../lib/project-route";

export const runtime = "nodejs";
export const maxDuration = 60;

const ROLES = ["client", "consultant", "contractor", "subcontractor", "viewer"] as const;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withProject(request, id, [...ROLES], async ({ db, project }) => {
    await runDocumentJobs().catch(() => undefined);
    const rows = await db.select().from(documents).where(eq(documents.projectId, project.id));
    return Response.json({
      documents: rows.filter((row) => row.fileName).map((row) => documentChip(row)),
    });
  });
}
