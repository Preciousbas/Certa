import { documents } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { enqueueExtraction, ingestDocument, parseDocumentJob } from "../../../../../../../../../src/server/intake/flow";
import { getObject } from "../../../../../../../../../src/server/storage";
import { UPLOAD_MAX_BYTES } from "../../../../../../../../../src/server/intake/detect";
import { readFailed, UPLOAD_DROPPED } from "../../../../../../../../../src/server/intake/messages";
import { runDocumentJobs } from "../../../../../../../../../src/server/intake/run";
import { withProject } from "../../../../../../../lib/project-route";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await context.params;
  return withProject(request, id, ["client", "consultant"], async ({ db, userId, project }) => {
    const document = (await db.select().from(documents).where(and(eq(documents.id, docId), eq(documents.projectId, project.id))))[0];
    if (!document) return Response.json({ error: "not_found", message: "That file is not on this project." }, { status: 404 });
    const stored = await getObject("documents", document.storageKey).catch(() => null);
    if (!stored) return Response.json({ error: "upload_failed", message: UPLOAD_DROPPED }, { status: 409 });
    if (stored.bytes.length > UPLOAD_MAX_BYTES) return Response.json({ error: "too_large", message: "This file is bigger than 20 MB." }, { status: 413 });
    const result = await ingestDocument(db, {
      projectId: project.id,
      workspaceId: project.workspaceId,
      userId,
      documentId: document.id,
      fileName: document.fileName ?? "upload",
      bytes: stored.bytes,
    });
    if (!result.ok) return Response.json({ error: "rejected", message: result.message }, { status: 422 });
    await parseDocumentJob(db, result.documentId);
    const fresh = (await db.select().from(documents).where(eq(documents.id, result.documentId)))[0];
    if (!fresh || fresh.status === "failed") {
      const name = fresh?.fileName ?? document.fileName ?? "that file";
      return Response.json({ error: "rejected", message: readFailed(name, "The spreadsheet could not be opened.") }, { status: 422 });
    }
    await enqueueExtraction(db, project.id);
    await runDocumentJobs();
    return Response.json({ ok: true, documentId: result.documentId, pagesOrSheets: result.pagesOrSheets, status: "Read" });
  });
}
