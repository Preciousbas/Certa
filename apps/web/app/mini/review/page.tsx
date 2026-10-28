import { getDatabase, photos } from "@certa/db";
import { eq } from "drizzle-orm";
import { stageLocationNote } from "../../../../../src/server/site/note";
import { ReviewActions } from "../../../components/review-actions";
import { loadProject } from "../../../lib/data";
import { isReviewStatus } from "../../../lib/labels";

export default async function MiniReviewPage() {
  const data = await loadProject();
  const stage = data?.stages.find((row) => isReviewStatus(row.status));
  if (!data || !stage) return <p>Nothing is waiting for a decision.</p>;
  const db = await getDatabase();
  const shots = await db.select().from(photos).where(eq(photos.stageId, stage.id));
  const note = stageLocationNote(shots.map((shot) => ({
    distanceFromSiteM: shot.distanceFromSiteM,
    checks: shot.checksJson as { site_pin?: boolean; in_radius?: boolean },
  })));
  return (
    <div>
      <p className="eyebrow">Review</p>
      <h1>{stage.name}</h1>
      {note ? <p className="muted">{note}</p> : null}
      <ReviewActions
        projectId={data.project.id}
        stageId={stage.id}
        mainButton
        needsReason={stage.status === "needs_more_evidence" || stage.status === "ai_fail"}
      />
    </div>
  );
}
