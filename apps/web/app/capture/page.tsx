import { getDatabase, submissions, users } from "@certa/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { AICheckCard } from "../../components/ai-check";
import { Camera } from "../../components/camera";
import { loadProject } from "../../lib/data";
import { isReviewStatus } from "../../lib/labels";

const assessment = z.object({
  observations: z.array(z.string()).optional(),
  missingEvidence: z.array(z.string()).optional(),
  evidence: z.array(z.object({ item: z.string(), seen: z.boolean() })).optional(),
  verdict: z
    .object({
      evidence: z.array(z.object({ item: z.string(), seen: z.boolean() })).optional(),
      concerns: z.array(z.string()).optional(),
    })
    .optional(),
  concerns: z.array(z.string()).optional(),
  model: z.string().nullable().optional(),
  source: z.string().optional(),
  decision: z.string().optional(),
});

export default async function CapturePage() {
  const data = await loadProject();
  const stage =
    data?.stages.find((row) => isReviewStatus(row.status)) ??
    data?.stages.find((row) => row.status !== "released");
  if (!data || !stage) return <p>No stage is open for a photo.</p>;
  const db = await getDatabase();
  const note = (
    await db.select().from(submissions).where(eq(submissions.projectId, data.project.id))
  )
    .filter((row) => row.stageId === stage.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const parsed = assessment.safeParse(note?.aiAssessmentJson);
  const consultant = data.parties.find((party) => party.role === "consultant");
  const consultantName = consultant
    ? (await db.select().from(users).where(eq(users.id, consultant.userId)))[0]?.name
    : undefined;
  const evidence = parsed.success
    ? (parsed.data.verdict?.evidence ?? parsed.data.evidence)
    : undefined;
  const seen = evidence
    ? evidence.filter((item) => item.seen).map((item) => item.item)
    : parsed.success
      ? (parsed.data.observations ?? [])
      : [];
  const missing = evidence
    ? evidence.filter((item) => !item.seen).map((item) => item.item)
    : parsed.success
      ? (parsed.data.missingEvidence ?? [])
      : [];
  const modelNote =
    parsed.success && parsed.data.model
      ? null
      : note
        ? "No photo model is recorded for this check."
        : null;
  const notice =
    note?.decision === "recommend_release"
      ? "The check passed the threshold. The money stays locked until someone releases it."
      : note?.decision === "hold"
        ? "The check is on hold. The money stays locked."
        : note?.decision === "consultant_review"
          ? `Sent to ${consultantName ?? "the consultant"} for review. Money stays locked until then.`
          : null;
  return (
    <Camera
      projectId={data.project.id}
      stageId={stage.id}
      stageName={stage.name}
      stageNumber={stage.stageIndex + 1}
      botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? ""}
      actionLabel={note ? "Add another photo" : "Take photo"}
    >
      {note ? (
        <AICheckCard
          status={stage.status}
          confidence={note.confidence}
          threshold={0.85}
          seen={seen}
          missing={missing}
          notice={notice}
          modelNote={modelNote}
        />
      ) : null}
    </Camera>
  );
}
