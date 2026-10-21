import { getDatabase, submissions, users } from "@certa/db";
import { formatNgnFromKobo } from "@certa/shared";
import { eq } from "drizzle-orm";
import { EmptyState } from "../components/empty-state";
import { MiniHome } from "../components/mini-home";
import { MoneyReleased } from "../components/money";
import { NeedsYouCard } from "../components/needs-you";
import { ProgressBar } from "../components/progress-bar";
import { StageRow } from "../components/stage-row";
import { loadProject } from "../lib/data";
import { isLockedStage, isReviewStatus, sharePercent } from "../lib/labels";

export default async function HomePage() {
  const data = await loadProject();
  if (!data) {
    return (
      <MiniHome>
        <EmptyState
          title="Nothing has happened on this project yet."
          body="Upload the contract or BoQ to begin."
        />
      </MiniHome>
    );
  }
  const released = data.stages.filter((stage) => stage.status === "released");
  const review = data.stages.filter((stage) => isReviewStatus(stage.status));
  const locked = data.stages.filter((stage) => isLockedStage(stage.status, stage.funded));
  const sum = (rows: typeof data.stages, field: "amountNgnKobo" | "amountUsdc") =>
    rows.reduce((total, stage) => total + stage[field], 0n);
  const releasedKobo = sum(released, "amountNgnKobo");
  const reviewKobo = sum(review, "amountNgnKobo");
  const lockedKobo = sum(locked, "amountNgnKobo");
  const total = data.shownKobo;
  const waiting = review[0];
  const db = await getDatabase();
  const note = waiting
    ? (await db.select().from(submissions).where(eq(submissions.projectId, data.project.id))).find(
        (row) => row.stageId === waiting.id,
      )
    : undefined;
  const consultant = data.parties.find((party) => party.role === "consultant");
  const consultantName = consultant
    ? (await db.select().from(users).where(eq(users.id, consultant.userId)))[0]?.name
    : undefined;
  const rateNote = `${formatNgnFromKobo(data.project.fxRateLocked)} per USDC, the rate locked for this contract`;
  const liveNote = note?.evidenceHash === "0xseed" ? undefined : note;
  const detail =
    liveNote?.confidence == null
      ? "This stage is in review."
      : `AI confidence ${liveNote.confidence.toFixed(2)}. ${liveNote.confidence < 0.85 ? "Below auto-release." : "Meets auto-release."} ${consultantName ? `Send to ${consultantName}.` : "Send it for review."}`;
  return (
    <MiniHome>
    <div>
      <article className="hero">
        <p className="eyebrow">{data.project.siteLocation}</p>
        <h1>{data.project.name}</h1>
        <MoneyReleased
          releasedKobo={releasedKobo.toString()}
          releasedUsdc={sum(released, "amountUsdc").toString()}
          totalKobo={total.toString()}
          totalUsdc={data.shownUsdc.toString()}
        />
        <p className="hero-note">{rateNote}</p>
        {data.moneyNote ? <p className="hero-note">{data.moneyNote}</p> : null}
        <ProgressBar
          released={sharePercent(releasedKobo, total)}
          review={sharePercent(reviewKobo, total)}
          locked={sharePercent(lockedKobo, total)}
        />
        <p className="progress-caption">{sharePercent(releasedKobo, total).toFixed(0)}% Released</p>
      </article>
      {waiting ? (
        <NeedsYouCard
          stageNumber={waiting.stageIndex + 1}
          stageName={waiting.name}
          status={waiting.status}
          detail={detail}
        />
      ) : null}
      <div className="stage-list">
        {data.stages.map((stage) => (
          <StageRow
            key={stage.id}
            number={stage.stageIndex + 1}
            name={stage.name}
            status={stage.status}
            kobo={stage.amountNgnKobo.toString()}
            usdc={stage.amountUsdc.toString()}
            txHash={data.payments.find((row) => row.stageId === stage.id && row.txHash)?.txHash}
          />
        ))}
      </div>
    </div>
    </MiniHome>
  );
}
