import { auditLog, getDatabase } from "@certa/db";
import { eq } from "drizzle-orm";
import { loadProject } from "../../../../lib/data";
import { EmptyState } from "../../../../components/empty-state";
import { MoneyAmount, MoneyReleased } from "../../../../components/money";
import { ProgressBar } from "../../../../components/progress-bar";
import { StageRow } from "../../../../components/stage-row";
import { isLockedStage, isReviewStatus, sharePercent } from "../../../../lib/labels";
import { formatWat } from "../../../../../../src/server/verify/messages";

export default async function OverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const data = await loadProject();
  if (!data || data.project.id !== projectId) {
    return <EmptyState title="Start by uploading the contract or BoQ" body="That project is not open in this session." />;
  }
  const released = data.stages.filter((stage) => stage.status === "released");
  const review = data.stages.filter((stage) => isReviewStatus(stage.status));
  const locked = data.stages.filter((stage) => isLockedStage(stage.status, stage.funded));
  const sum = (rows: typeof data.stages, field: "amountNgnKobo" | "amountUsdc") => rows.reduce((total, stage) => total + stage[field], 0n);
  const releasedKobo = sum(released, "amountNgnKobo");
  const total = data.shownKobo;
  const db = await getDatabase();
  const latest = (await db.select().from(auditLog).where(eq(auditLog.projectId, projectId)))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);
  const accepted = (data.project.termsHash ?? "").length > 0;
  return (
    <div>
      <article className="hero">
        <p className="eyebrow">{data.project.siteLocation}</p>
        <h1>{data.project.name}</h1>
        <p>
          Contract sum{" "}
          <MoneyAmount kobo={data.project.contractSumKobo.toString()} usdc={data.project.contractSumUsdc.toString()} />
        </p>
        <MoneyReleased
          releasedKobo={releasedKobo.toString()}
          releasedUsdc={sum(released, "amountUsdc").toString()}
          totalKobo={total.toString()}
          totalUsdc={data.shownUsdc.toString()}
        />
        <ProgressBar
          released={sharePercent(releasedKobo, total)}
          review={sharePercent(sum(review, "amountNgnKobo"), total)}
          locked={sharePercent(sum(locked, "amountNgnKobo"), total)}
        />
      </article>
      {!accepted ? (
        <EmptyState title="Start by uploading the contract or BoQ" body="Upload the signed contract and the priced BoQ." />
      ) : null}
      {review.length > 0 ? (
        <section className="card">
          <h2>Waiting for you</h2>
          <ul>
            {review.map((stage) => (
              <li key={stage.id}>
                <a href={`/app/p/${data.project.id}/stages/${stage.stageIndex + 1}`}>{stage.name}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h2>Latest</h2>
        {latest.length === 0 ? <p className="muted">Nothing has happened on this project yet.</p> : null}
        <ul className="plain">
          {latest.map((event) => (
            <li key={event.id}>{event.action.replaceAll("_", " ")} · {formatWat(event.createdAt)}</li>
          ))}
        </ul>
      </section>
      {data.stages.length === 0 ? (
        <EmptyState title="Start by uploading the contract or BoQ" body="Upload the signed contract and the priced BoQ." />
      ) : (
        <div className="stage-list">
          {data.stages.slice(0, 5).map((stage) => (
            <StageRow
              key={stage.id}
              number={stage.stageIndex + 1}
              name={stage.name}
              status={stage.status}
              kobo={stage.amountNgnKobo.toString()}
              usdc={stage.amountUsdc.toString()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
