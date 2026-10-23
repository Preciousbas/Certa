import type { ReactNode } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skel ${className}`} />;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card empty-state">
      <h2>{title}</h2>
      {body ? <p className="muted">{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, errorId, onRetryHref = "" }: { message: string; errorId?: string; onRetryHref?: string }) {
  return (
    <div className="card" role="alert">
      <h2>{message}</h2>
      {errorId ? <p className="muted">Error id {errorId}</p> : null}
      {onRetryHref ? <a className="ui-btn ui-btn-secondary" href={onRetryHref}>Try again</a> : <a className="ui-btn ui-btn-secondary" href="">Try again</a>}
    </div>
  );
}

export function StatTile({ label, value, tip }: { label: string; value: ReactNode; tip?: ReactNode }) {
  return (
    <article className="stat">
      <span>
        {label} {tip}
      </span>
      <strong>{value}</strong>
    </article>
  );
}
