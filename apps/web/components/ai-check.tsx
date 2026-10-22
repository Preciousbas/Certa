import { StatusChip } from "./status-chip";

export function AICheckCard({
  status,
  confidence,
  threshold,
  seen,
  missing,
  notice,
  modelNote,
}: {
  status: string;
  confidence: number | null;
  threshold: number;
  seen: string[];
  missing: string[];
  notice: string | null;
  modelNote?: string | null;
}) {
  const width = confidence == null ? 0 : Math.max(0, Math.min(100, confidence * 100));
  return (
    <article className="card ai-check">
      <div className="ai-head">
        <h2>AI check</h2>
        <StatusChip status={status} />
      </div>
      {confidence == null ? (
        <p className="muted">No confidence score is stored.</p>
      ) : (
        <>
          <div className="confidence" aria-hidden="true">
            <span className="confidence-fill" style={{ width: `${width}%` }} />
            <span className="confidence-mark" style={{ left: `${threshold * 100}%` }} />
          </div>
          <p className="confidence-caption">
            <span>Auto-release needs {threshold.toFixed(2)}</span>
            <span className="money">{confidence.toFixed(2)}</span>
          </p>
        </>
      )}
      <ul className="checks">
        {seen.map((item) => (
          <li key={item}>{item}</li>
        ))}
        {missing.map((item) => (
          <li className="missing" key={item}>
            {item}
          </li>
        ))}
      </ul>
      {modelNote ? <p className="faint">{modelNote}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}
    </article>
  );
}
