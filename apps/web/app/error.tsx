"use client";

export default function ErrorState({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card">
      <p className="eyebrow">Could not load</p>
      <h2>This page did not come back.</h2>
      <p className="muted">The project data is still there. Try the request again.</p>
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
