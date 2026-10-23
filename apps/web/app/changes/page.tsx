import { getDatabase, payments, users } from "@certa/db";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { ChangeActions } from "../../components/change-actions";
import { ChangeTabs } from "../../components/change-tabs";
import { ProposeChange } from "../../components/propose-change";
import { Deadline } from "../../components/deadline";
import { MoneyAmount } from "../../components/money";
import { StatusChip } from "../../components/status-chip";
import { SEPOLIA_CHAIN_ID, explorerTx } from "../../lib/explorer";
import { loadProject } from "../../lib/data";
import { changeSummary, formatPayBps } from "../../lib/labels";

const resolutionNote = z.object({ note: z.string().min(1) }).partial();
const resolutionPay = z.object({ payBps: z.number().int().nonnegative().max(10_000) });
const changeBody = z.object({ description: z.string().optional(), title: z.string().optional() }).partial();

function when(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(date);
}

export default async function ChangesPage() {
  const data = await loadProject();
  if (!data) return <p>No project is open.</p>;
  const db = await getDatabase();
  const ids = [...new Set([...data.changes.map((row) => row.requestedBy), ...data.disputes.map((row) => row.raisedBy)])];
  const people = ids.length === 0 ? [] : await db.select().from(users).where(inArray(users.id, ids));
  const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? "Someone on the project";
  const paid = await db.select().from(payments).where(inArray(payments.projectId, [data.project.id]));
  return (
    <div>
      <p className="eyebrow">Changes</p>
      <h1>Variations and disputes</h1>
      <ProposeChange
        stages={data.stages.map((stage) => ({ id: stage.id, label: `${stage.stageIndex + 1}. ${stage.name}` }))}
      />
      <ChangeTabs
        variations={
          <>
      {data.changes.length === 0 ? <p>No changes yet.</p> : null}
      {data.changes.map((change) => {
        const summary = changeSummary(change.type, change.afterJson, data.project.fxRateLocked);
        const deadline = new Date(change.createdAt.getTime() + data.project.changeReplyHours * 3_600_000).toISOString();
        return (
          <article className="card" key={change.id} style={{ marginBottom: 12 }}>
            <h2 style={{ marginTop: 0 }}>{summary?.title ?? "This change could not be read."}</h2>
            {summary ? <MoneyAmount kobo={summary.kobo} usdc={summary.usdc} /> : null}
            {changeBody.safeParse(change.afterJson).data?.description ? <p>{changeBody.safeParse(change.afterJson).data?.description}</p> : null}
            <p className="muted">Raised by {nameOf(change.requestedBy)} · {when(change.createdAt)}</p>
            <StatusChip status={change.status} kind="change" />
            {change.reason ? <p className="muted">{change.reason}</p> : null}
            <Deadline deadline={deadline} />
            {change.status === "pending" && change.requestedBy !== data.user.id ? (
              <ChangeActions projectId={data.project.id} changeId={change.id} />
            ) : null}
          </article>
        );
      })}
          </>
        }
        disputes={
          <>
      {data.disputes.length === 0 ? <p>No disputes.</p> : null}
      {data.disputes.map((dispute) => {
        const note = resolutionNote.safeParse(dispute.resolution);
        const pay = resolutionPay.safeParse(dispute.resolution);
        const payLabel = pay.success ? formatPayBps(pay.data.payBps) : null;
        const tx = paid.find((row) => row.stageId === dispute.stageId && row.txHash)?.txHash ?? null;
        return (
          <article className="card" key={dispute.id}>
            <p className="eyebrow">Dispute</p>
            <ol className="plain">
              <li>Raised by {nameOf(dispute.raisedBy)} · {when(dispute.openedAt)}. {dispute.reason}</li>
              <li>Decide after {when(dispute.deadlineAt)}.</li>
              {note.success && note.data.note ? (
                <li>Consultant decision: {note.data.note}{payLabel ? ` (${payLabel})` : ""}</li>
              ) : payLabel ? (
                <li>{payLabel}</li>
              ) : null}
              {tx ? (
                <li>
                  <a href={explorerTx(SEPOLIA_CHAIN_ID, tx)}>Release transaction</a>
                </li>
              ) : (
                <li>No release transaction is stored.</li>
              )}
            </ol>
          </article>
        );
      })}
          </>
        }
      />
    </div>
  );
}
