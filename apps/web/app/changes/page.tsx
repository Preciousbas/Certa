import { loadProject } from "../../lib/data";

export default async function ChangesPage() {
  const data = await loadProject();
  if (!data) return <p>No project is open.</p>;
  return (
    <div>
      <p className="eyebrow">Change log</p>
      <h1>Every yes, no, and the time it took.</h1>
      {data.changes.length === 0 ? <p>No changes yet.</p> : null}
      {data.changes.map((change) => (
        <article className="card" key={change.id} style={{ marginBottom: 12 }}>
          <p className="eyebrow">{change.type}</p>
          <h2 style={{ marginTop: 0 }}>{change.status}</h2>
          <p className="muted">{JSON.stringify(change.afterJson)}</p>
          <p className="faint">{change.reason ?? "Waiting on the contractor. A no needs a reason."}</p>
        </article>
      ))}
      {data.disputes.map((dispute) => (
        <article className="card" key={dispute.id}>
          <p className="eyebrow">Dispute · {dispute.status}</p>
          <p>{dispute.reason}</p>
        </article>
      ))}
    </div>
  );
}
