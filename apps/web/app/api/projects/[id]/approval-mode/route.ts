import { setApprovalMode } from "../../../../../../../src/server/projects/approvalMode";
import { withProject } from "../../../../../lib/project-route";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { mode?: string } | null;
  return withProject(request, id, ["client"], async ({ db, userId }) => {
    if (body?.mode !== "client" && body?.mode !== "consultant") {
      return Response.json({ error: "blocked", message: "Choose consultant or client." }, { status: 409 });
    }
    const result = await setApprovalMode(db, { userId, projectId: id, mode: body.mode });
    if (!result.ok) return Response.json({ error: "blocked", message: result.message }, { status: 409 });
    return Response.json({ ok: true, pending: Boolean(result.waiting), message: result.waiting ?? "Saved." });
  });
}
