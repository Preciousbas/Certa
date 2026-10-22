import { signedDocumentUpload } from "../../../../../../../../src/server/intake/flow";
import { withProject } from "../../../../../../lib/project-route";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { fileName?: string; size?: number } | null;
  const fileName = body?.fileName?.trim();
  if (!fileName) return Response.json({ error: "bad_request", message: "Choose a file." }, { status: 400 });
  return withProject(request, id, ["client", "consultant"], async ({ db, userId, project }) => {
    const issued = await signedDocumentUpload(db, { projectId: project.id, workspaceId: project.workspaceId, userId, fileName, size: body?.size });
    if ("error" in issued) return Response.json({ error: "upload_unavailable", message: issued.error }, { status: 422 });
    return Response.json({ uploadUrl: issued.uploadUrl, token: issued.token, path: issued.path, documentId: issued.documentId });
  });
}
