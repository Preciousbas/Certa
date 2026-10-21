import { getDatabase, submissions } from "@certa/db";
import { formatNgnFromKobo, formatUsdc } from "@certa/shared";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { MoneyAmount } from "../../components/money";
import { ReviewActions } from "../../components/review-actions";
import { StageRow } from "../../components/stage-row";
import { StatusChip } from "../../components/status-chip";
import { SEPOLIA_CHAIN_ID, explorerTx } from "../../lib/explorer";
import { loadProject } from "../../lib/data";
import { isLockedStage, isReviewStatus } from "../../lib/labels";

function total(
  rows: { amountNgnKobo: bigint; amountUsdc: bigint }[],
  field: "amountNgnKobo" | "amountUsdc",
) {
  return rows.reduce((sum, row) => sum + row[field], 0n);
}

export default async function StagesPage() {
  const data = await loadProject();
  if (!data) return <p>No project is open.</p>;
  const released = data.stages.filter((stage) => stage.status === "released");
  const review = data.stages.filter((stage) => isReviewStatus(stage.status));
  const locked = data.stages.filter((stage) => isLockedStage(stage.status, stage.funded));
  const db = await getDatabase();
  const notes = await db
    .select()
    .from(submissions)
    .where(eq(submissions.projectId, data.project.id));
  return (
    <div>
      <div className="desk-actions">
        <Link className="ghost" href="/certificate">
          Export certificate
        </Link>
        <Link className="btn" href="/changes">
          Propose change
        </Link>
      </div>
      {review.map((stage) => {
        const score = notes
          .filter((row) => row.stageId === stage.id && row.evidenceHash !== "0xseed")
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        return (
          <article className="card" key={stage.id} style={{ marginBottom: 12 }}>
            <p className="eyebrow">Review</p>
            <div className="needs-head">
              <strong>{stage.name}</strong>
              <StatusChip status={stage.status} />
            </div>
            <p className="muted">
              {score?.confidence == null
                ? "No score is stored."
                : `Score ${score.confidence.toFixed(2)}. Approving here does not pay the stage.`}
            </p>
            <ReviewActions projectId={data.project.id} stageId={stage.id} />
          </article>
        );
      })}
      <p className="eyebrow">{data.project.siteLocation}</p>
      <h1>Stage ledger</h1>
      <p className="muted">Confirm the split before anyone accepts it.</p>
      {data.moneyNote ? <p className="muted">{data.moneyNote}</p> : null}
      <div className="stat-row">
        <article className="stat">
          <span>Contract sum</span>
          <strong>
            <MoneyAmount kobo={data.shownKobo.toString()} usdc={data.shownUsdc.toString()} />
          </strong>
        </article>
        <article className="stat released">
          <span>Released</span>
          <strong>
            <MoneyAmount
              kobo={total(released, "amountNgnKobo").toString()}
              usdc={total(released, "amountUsdc").toString()}
            />
          </strong>
        </article>
        <article className="stat review">
          <span>In review</span>
          <strong>
            <MoneyAmount
              kobo={total(review, "amountNgnKobo").toString()}
              usdc={total(review, "amountUsdc").toString()}
            />
          </strong>
        </article>
        <article className="stat locked">
          <span>Locked</span>
          <strong>
            <MoneyAmount
              kobo={total(locked, "amountNgnKobo").toString()}
              usdc={total(locked, "amountUsdc").toString()}
            />
          </strong>
        </article>
      </div>
      <div className="stage-list">
        {data.stages.map((stage) => (
          <StageRow
            key={stage.id}
            number={stage.stageIndex + 1}
            name={stage.name}
            description={stage.description}
            status={stage.status}
            kobo={stage.amountNgnKobo.toString()}
            usdc={stage.amountUsdc.toString()}
            txHash={data.payments.find((row) => row.stageId === stage.id && row.txHash)?.txHash}
          />
        ))}
      </div>
      <table className="stage-table">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Stage</th>
            <th>Status</th>
            <th className="amount">Naira</th>
            <th className="amount">USDC</th>
          </tr>
        </thead>
        <tbody>
          {data.stages.map((stage) => (
            <tr key={stage.id}>
              <td className="num">{stage.stageIndex + 1}</td>
              <td>
                <strong>{stage.name}</strong>
                <div className="faint">{stage.description}</div>
                {/^0x[a-fA-F0-9]{64}$/.test(
                  data.payments.find((row) => row.stageId === stage.id)?.txHash ?? "",
                ) ? (
                  <a
                    className="faint"
                    href={explorerTx(SEPOLIA_CHAIN_ID, data.payments.find((row) => row.stageId === stage.id)?.txHash ?? "")}
                  >
                    Transaction
                  </a>
                ) : stage.status === "released" ? (
                  <div className="faint">Not on chain yet.</div>
                ) : null}
              </td>
              <td>
                <StatusChip status={stage.status} />
              </td>
              <td className="amount money">{formatNgnFromKobo(stage.amountNgnKobo)}</td>
              <td className="amount money">{formatUsdc(stage.amountUsdc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
