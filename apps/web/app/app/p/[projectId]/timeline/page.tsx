import { aiVerdicts, auditLog, chainTxs, getDatabase, photos, projects, stages, x402Spend } from "@certa/db";
import { eq } from "drizzle-orm";
import { BASE_SEPOLIA_CHAIN_ID, explorerTx, SEPOLIA_CHAIN_ID } from "../../../../../lib/explorer";
import { usdcPlain } from "../../../../../../../src/server/x402/gate";
import { photoThumb } from "../../../../../lib/photo-thumb";
import { formatWat } from "../../../../../../../src/server/verify/messages";

export default async function TimelinePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const db = await getDatabase();
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
  if (!project) return <p>Something went wrong loading the timeline. Try again.</p>;
  const events = (await db.select().from(auditLog).where(eq(auditLog.projectId, projectId)))
    .filter((row) => row.action === "photos_submitted" || row.action === "ai_verdict" || row.action === "stage_submitted_onchain")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const stageRows = await db.select().from(stages).where(eq(stages.projectId, projectId));
  const shots = await db.select().from(photos).where(eq(photos.projectId, projectId));
  const verdicts = (await db.select().from(aiVerdicts)).filter((row) => stageRows.some((stage) => stage.id === row.stageId));
  const txs = (await db.select().from(chainTxs).where(eq(chainTxs.projectId, projectId))).filter((row) => row.kind === "submit_stage");
  const spends = await db.select().from(x402Spend).where(eq(x402Spend.projectId, projectId));
  const feeTxs = await db.select().from(chainTxs).where(eq(chainTxs.projectId, projectId));
  const thumbs = new Map<string, string | null>();
  for (const shot of shots) thumbs.set(shot.id, await photoThumb(shot.stampedKey || shot.storageKey));
  if (events.length === 0 && shots.length === 0 && spends.length === 0) return <p>Nothing has happened on this project yet.</p>;
  return (
    <div>
      <p className="eyebrow">Timeline</p>
      <h1>{project.name}</h1>
      {events.map((event) => {
        if (event.action === "photos_submitted") {
          const related = shots.filter((shot) => shot.submissionId === event.entityId);
          return (
            <article key={event.id} className="card">
              <h2>Photos sent</h2>
              <div className="photo-grid">
                {related.map((shot, index) => (
                  <figure key={shot.id}>
                    {thumbs.get(shot.id) ? <img src={thumbs.get(shot.id) ?? ""} alt={`Site photo ${index + 1}`} /> : null}
                    <figcaption>
                      {shot.capturedAt ? formatWat(shot.capturedAt) : ""}
                      {shot.distanceFromSiteM != null ? ` · ${Math.round(shot.distanceFromSiteM)} m from site` : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </article>
          );
        }
        if (event.action === "ai_verdict") {
          const verdict = verdicts.find((row) => row.submissionId === event.entityId);
          const label = verdict?.verdict === "pass" ? "Pass" : verdict?.verdict === "fail" ? "Fail" : "Not sure";
          return (
            <article key={event.id} className="card">
              <h2>Photo check · {label}{verdict ? ` · ${Math.round(verdict.confidence * 100)}%` : ""}</h2>
              {verdict?.reasons.map((reason) => <p key={reason}>{reason}</p>)}
              {verdict ? (
                <details>
                  <summary>Show technical details</summary>
                  <p>{verdict.model} · {verdict.promptVersion}</p>
                </details>
              ) : null}
            </article>
          );
        }
        const tx = txs.find((row) => row.txHash);
        return (
          <article key={event.id} className="card">
            <h2>Sent for certification</h2>
            {tx?.txHash ? <a href={explorerTx(SEPOLIA_CHAIN_ID, tx.txHash)}>Etherscan</a> : <p>Waiting for the network record.</p>}
          </article>
        );
      })}
      {spends.map((spend) => {
        const tx = feeTxs.find((row) => row.id === spend.chainTxId);
        const chip = spend.resultSummary === "Rain likely" ? "Rain likely" : spend.resultSummary === "Good to pour" ? "Good to pour" : spend.resultSummary;
        return (
          <article key={spend.id} className="card">
            <h2>Agent paid {usdcPlain(spend.amountMicro)} USDC for a weather check</h2>
            <p className={chip === "Good to pour" ? "chip chip-released" : "chip chip-review"}>{chip}</p>
            {tx?.txHash && tx.chainId === BASE_SEPOLIA_CHAIN_ID ? <a href={explorerTx(BASE_SEPOLIA_CHAIN_ID, tx.txHash)}>Proof ↗</a> : <p>Waiting for the network record.</p>}
            <details>
              <summary>Show technical details</summary>
              <p>This fee was paid on Base Sepolia. Escrow payments stay on Ethereum Sepolia.</p>
            </details>
          </article>
        );
      })}
    </div>
  );
}
