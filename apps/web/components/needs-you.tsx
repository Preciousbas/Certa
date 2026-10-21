import { StatusChip } from "./status-chip";

export function NeedsYouCard({
  stageNumber,
  stageName,
  status,
  detail,
}: {
  stageNumber: number;
  stageName: string;
  status: string;
  detail: string;
}) {
  return (
    <article className="needs-you">
      <p className="needs-label">Needs you</p>
      <div className="needs-head">
        <strong>
          Stage {stageNumber} · {stageName}
        </strong>
        <StatusChip status={status} />
      </div>
      <p>{detail}</p>
    </article>
  );
}
