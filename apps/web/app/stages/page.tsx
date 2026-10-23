import { getDatabase, submissions, users } from "@certa/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { MoneyAmount } from "../../components/money";
import { ReviewActions } from "../../components/review-actions";
import { StatusChip } from "../../components/status-chip";
import { DataTable } from "../../components/ui/dialog";
import { InfoTip } from "../../components/ui/chips";
import { loadProject } from "../../lib/data";
import { isLockedStage, isReviewStatus } from "../../lib/labels";

function total(rows: { amountNgnKobo: bigint; amountUsdc: bigint }[], field: "amountNgnKobo" | "amountUsdc") {
  return rows.reduce((sum, row) => sum + row[field], 0n);
}

function held(rows: { amountNgnKobo: bigint; amountUsdc: bigint; retentionBps: number; status: string }[]) {
  return rows
    .filter((row) => row.status === "released")
    .reduce(
      (sum, row) => ({
        kobo: sum.kobo + (row.amountNgnKobo * BigInt(row.retentionBps)) / 10000n,
        usdc: sum.usdc + (row.amountUsdc * BigInt(row.retentionBps)) / 10000n,
      }),
      { kobo: 0n, usdc: 0n },
    );
}

export default async function StagesPage({ searchParams }: { searchParams?: Promise<{ sort?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const data = await loadProject();
  if (!data) return <p>No project is open.</p>;
  const released = data.stages.filter((stage) => stage.status === "released");
  const review = data.stages.filter((stage) => isReviewStatus(stage.status));
  const locked = data.stages.filter((stage) => isLockedStage(stage.status, stage.funded));
  const retention = held(data.stages);
  const db = await getDatabase();
  const notes = await db.select().from(submissions).where(eq(submissions.projectId, data.project.id));
  const people = await db.select().from(users);
  const sorted = [...data.stages].sort((a, b) => {
    if (query.sort === "amount") return a.amountNgnKobo < b.amountNgnKobo ? -1 : a.amountNgnKobo > b.amountNgnKobo ? 1 : 0;
    if (query.sort === "name") return a.name.localeCompare(b.name);
    return a.stageIndex - b.stageIndex;
  });
  return (
    <div>
      <p className="eyebrow">{data.project.siteLocation}</p>
      <h1>Stages</h1>
      <p className="muted">Amounts follow the currency switch.</p>
      {review.map((stage) => {
        const score = notes
          .filter((row) => row.stageId === stage.id && row.evidenceHash !== "0xseed")
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        return (
          <article className="card" key={stage.id} style={{ marginBottom: 12 }}>
            <p className="eyebrow">Waiting for you</p>
            <div className="needs-head">
              <strong>{stage.name}</strong>
              <StatusChip status={stage.status} />
            </div>
            <p className="muted">
              {score?.confidence == null
                ? "No score is stored."
                : `Score ${score.confidence.toFixed(2)}. Approving here does not pay the stage.`}
            </p>
            <ReviewActions
              needsReason={stage.status === "needs_more_evidence" || stage.status === "ai_fail"}
              projectId={data.project.id}
              stageId={stage.id}
            />
          </article>
        );
      })}
      <div className="stat-row">
        <article className="stat locked">
          <span>Locked <InfoTip term="Locked" /></span>
          <strong><MoneyAmount kobo={total(locked, "amountNgnKobo").toString()} usdc={total(locked, "amountUsdc").toString()} /></strong>
        </article>
        <article className="stat review">
          <span>In review <InfoTip term="In review" /></span>
          <strong><MoneyAmount kobo={total(review, "amountNgnKobo").toString()} usdc={total(review, "amountUsdc").toString()} /></strong>
        </article>
        <article className="stat released">
          <span>Released <InfoTip term="Released" /></span>
          <strong><MoneyAmount kobo={total(released, "amountNgnKobo").toString()} usdc={total(released, "amountUsdc").toString()} /></strong>
        </article>
        <article className="stat">
          <span>Retention held <InfoTip term="Retention" /></span>
          <strong><MoneyAmount kobo={retention.kobo.toString()} usdc={retention.usdc.toString()} /></strong>
        </article>
      </div>
      <p className="sort-row">
        <Link href="?sort=number">Sort by number</Link>
        {" · "}
        <Link href="?sort=name">Sort by name</Link>
        {" · "}
        <Link href="?sort=amount">Sort by amount</Link>
      </p>
      <DataTable
        columns={["#", "Stage", "Amount", "Status", "Last event", "Assigned to"]}
        rows={sorted.map((stage) => {
          const party = data.parties.find((row) => row.id === stage.assignedPartyId);
          const person = people.find((row) => row.id === party?.userId);
          const assigned = person?.name ?? "Unassigned";
          const href = `/app/p/${data.project.id}/stages/${stage.stageIndex + 1}`;
          return {
            key: stage.id,
            cells: [
              stage.stageIndex + 1,
              <Link key="name" href={href}>{stage.name}</Link>,
              <MoneyAmount key="money" kobo={stage.amountNgnKobo.toString()} usdc={stage.amountUsdc.toString()} />,
              <StatusChip key="status" status={stage.status} />,
              <StatusChip key="event" status={stage.status} />,
              assigned,
            ],
            card: (
              <div>
                <Link href={href}><strong>{stage.stageIndex + 1}. {stage.name}</strong></Link>
                <p><MoneyAmount kobo={stage.amountNgnKobo.toString()} usdc={stage.amountUsdc.toString()} /></p>
                <StatusChip status={stage.status} />
                <p className="muted">{assigned}</p>
              </div>
            ),
          };
        })}
      />
    </div>
  );
}
