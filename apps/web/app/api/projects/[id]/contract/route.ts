import { acceptPlan, sendPlan } from "../../../../../../../src/server/intake/flow";
import { AGREED_LOCKED } from "../../../../../../../src/server/intake/messages";
import { editStages, loadReview, reviewAction, type StageEdit } from "../../../../../../../src/server/intake/review";
import { withProject } from "../../../../../lib/project-route";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withProject(request, id, ["client", "contractor", "consultant"], async ({ db, role }) => {
    const review = await loadReview(db, id, role);
    if (!review) return Response.json({ empty: true });
    return Response.json(review);
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    decision?: "accepted" | "change_requested";
    reason?: string;
    send?: boolean;
    action?: "correct" | "keep";
    code?: string;
    anchor?: string | null;
    stageIndex?: number | null;
    value?: string;
    stageEdit?: StageEdit;
  } | null;
  return withProject(request, id, ["client", "contractor"], async ({ db, userId, role }) => {
    if (body?.stageEdit) {
      if (role !== "client") return Response.json({ error: "forbidden", message: "Only the client can correct the figures." }, { status: 403 });
      const updated = await editStages(db, { projectId: id, edit: body.stageEdit });
      if (!updated.ok) return Response.json({ error: "blocked", message: updated.message }, { status: 409 });
      return Response.json({ ...updated.review, message: updated.message });
    }
    if (body?.action === "correct" || body?.action === "keep") {
      if (role !== "client") return Response.json({ error: "forbidden", message: "Only the client can correct the figures." }, { status: 403 });
      const updated = await reviewAction(db, { projectId: id, action: body.action, code: body.code, anchor: body.anchor, stageIndex: body.stageIndex, value: body.value, role });
      if (!updated.ok) return Response.json({ error: "blocked", message: updated.message }, { status: 409 });
      return Response.json(updated.review);
    }
    if (body?.send) {
      if (role !== "client") return Response.json({ error: "forbidden", message: "Only the client can send the plan." }, { status: 403 });
      const sent = await sendPlan(db, { projectId: id, userId });
      if (!sent.ok) return Response.json({ error: "blocked", message: sent.message === AGREED_LOCKED ? AGREED_LOCKED : sent.message }, { status: 409 });
      return Response.json({ ok: true, versionId: sent.versionId, hash: sent.hash });
    }
    if (role !== "client" && role !== "contractor") {
      return Response.json({ error: "forbidden", message: "Only the client and contractor accept the plan." }, { status: 403 });
    }
    const result = await acceptPlan(db, {
      projectId: id,
      userId,
      role,
      decision: body?.decision ?? "accepted",
      reason: body?.reason,
    });
    if (!result.ok) return Response.json({ error: "blocked", message: result.message }, { status: 409 });
    return Response.json(result);
  });
}
