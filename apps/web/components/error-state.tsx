"use client";

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="card empty-state" role="alert">
      <p className="eyebrow">Could not load</p>
      <h2>This page did not come back.</h2>
      <p className="muted">The project data is still there. Try the request again.</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
