import { aiVerdicts, chainTxs, getDatabase, photos, projects, stages } from "@certa/db";
import { and, desc, eq } from "drizzle-orm";
import { explorerTx, SEPOLIA_CHAIN_ID } from "../../../../../../lib/explorer";
import { photoThumb } from "../../../../../../lib/photo-thumb";
import { ReviewActions } from "../../../../../../components/review-actions";
import { PlanPour } from "../../../../../../components/plan-pour";
import { formatWat } from "../../../../../../../../src/server/verify/messages";
import { stageNeedsWeather } from "../../../../../../../../src/server/x402/gate";

function chip(verdict: string): string {
  if (verdict === "pass") return "Pass";
  if (verdict === "fail") return "Fail";
  return "Not sure";
}

export default async function StageDetailPage({ params }: { params: Promise<{ projectId: string; n: string }> }) {
  const { projectId, n } = await params;
  const number = Number(n);
  const db = await getDatabase();
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
  const stage = (
    await db.select().from(stages).where(and(eq(stages.projectId, projectId), eq(stages.stageIndex, number - 1)))
  )[0];
  if (!project || !stage || !Number.isInteger(number)) {
    return <p>Something went wrong loading this stage. Try again.</p>;
  }
  const shots = (await db.select().from(photos).where(eq(photos.stageId, stage.id))).sort((a, b) => (a.capturedAt?.getTime() ?? 0) - (b.capturedAt?.getTime() ?? 0));
  const thumbs = await Promise.all(shots.map((shot) => photoThumb(shot.stampedKey || shot.storageKey)));
  const verdicts = await db.select().from(aiVerdicts).where(eq(aiVerdicts.stageId, stage.id)).orderBy(desc(aiVerdicts.createdAt));
  const latest = verdicts[0];
  const txs = (await db.select().from(chainTxs).where(eq(chainTxs.stageId, stage.id))).filter((row) => row.kind === "submit_stage");
  const criteria = Array.isArray(latest?.criteriaResults) ? latest.criteriaResults : [];
  return (
    <div>
      <p className="eyebrow">Stage {stage.stageIndex + 1}</p>
      <h1>{stage.name}</h1>
      <p><a href={`/mini/capture?stage=${stage.id}`}>Submit photos</a></p>
      {stageNeedsWeather(stage) && (stage.status === "not_started" || stage.status === "in_progress") ? (
        <PlanPour projectId={project.id} stageId={stage.id} />
      ) : null}
      <h2>Photos</h2>
      {shots.length === 0 ? <p>No photos yet.</p> : (
        <div className="photo-grid">
          {shots.map((shot, index) => (
            <figure key={shot.id}>
              {thumbs[index] ? <img src={thumbs[index]} alt={`Site photo ${index + 1} for stage ${stage.stageIndex + 1}, taken ${shot.capturedAt ? formatWat(shot.capturedAt) : "an unknown time"}`} /> : null}
              <figcaption>
                {shot.capturedAt ? formatWat(shot.capturedAt) : "Time not recorded"}
                {shot.distanceFromSiteM != null ? ` · ${Math.round(shot.distanceFromSiteM)} m from site` : ""}
                <br />
                {shot.sha256.slice(0, 8)}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <h2>Check</h2>
      {stage.status === "ai_review" && !latest ? <p>Certa is checking these photos.</p> : null}
      {latest ? (
        <div className="card">
          <p className={latest.verdict === "pass" ? "verdict-pass" : latest.verdict === "fail" ? "verdict-fail" : "verdict-unsure"}>{chip(latest.verdict)} · {Math.round(latest.confidence * 100)}%</p>
          <ul>
            {criteria.map((item) => {
              const row = item as { id?: string; result?: string; reason?: string };
              const mark = row.result === "met" ? "✓" : row.result === "not_met" ? "✗" : "–";
              return <li key={row.id ?? row.reason}>{mark} {row.reason}</li>;
            })}
          </ul>
          {latest.reasons.map((reason) => <p key={reason}>{reason}</p>)}
          {latest.issues.map((issue) => <p key={issue}>{issue}</p>)}
          <details>
            <summary>Show technical details</summary>
            <p>{latest.model} · {latest.promptVersion}</p>
          </details>
        </div>
      ) : stage.status === "ai_review" ? null : <p>No check yet.</p>}
      {stage.status === "needs_more_evidence" || stage.status === "ai_fail" ? (
        <ReviewActions needsReason projectId={project.id} stageId={stage.id} />
      ) : null}
      <h2>Proof of payment</h2>
      {txs.length === 0 ? <p>No network record for this stage yet.</p> : txs.map((tx) => (
        <p key={tx.id}>{tx.status}{tx.txHash ? <> · <a href={explorerTx(SEPOLIA_CHAIN_ID, tx.txHash)}>Etherscan</a></> : null}</p>
      ))}
    </div>
  );
}
