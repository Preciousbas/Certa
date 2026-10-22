"use client";

export default function ErrorPage({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <article>
      <h1>Something went wrong on our side. Nothing was paid or changed.</h1>
      <p className="muted">Error id {error.digest ?? "unknown"}</p>
      <div className="actions">
        <a className="ui-btn ui-btn-secondary" href="/app">Go to your projects</a>
        <a className="ui-btn ui-btn-secondary" href="/">Home</a>
      </div>
    </article>
  );
}
