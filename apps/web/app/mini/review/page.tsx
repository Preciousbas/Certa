import { ReviewActions } from "../../../components/review-actions";
import { loadProject } from "../../../lib/data";
import { isReviewStatus } from "../../../lib/labels";

export default async function MiniReviewPage() {
  const data = await loadProject();
  const stage = data?.stages.find((row) => isReviewStatus(row.status));
  if (!data || !stage) return <p>Nothing is waiting for a decision.</p>;
  return (
    <div>
      <p className="eyebrow">Review</p>
      <h1>{stage.name}</h1>
      <ReviewActions
        projectId={data.project.id}
        stageId={stage.id}
        mainButton
        needsReason={stage.status === "needs_more_evidence" || stage.status === "ai_fail"}
      />
    </div>
  );
}
