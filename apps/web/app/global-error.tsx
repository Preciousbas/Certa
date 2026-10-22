"use client";

import { PageContainer } from "../components/ui/page";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const id = error.digest ?? "unknown";
  return (
    <html lang="en">
      <body>
        <PageContainer>
          <h1>Something went wrong on our side. Nothing was paid or changed.</h1>
          <p className="muted">Error id {id}</p>
          <div className="actions">
            <a className="ui-btn ui-btn-secondary" href="/app">Go to your projects</a>
            <a className="ui-btn ui-btn-secondary" href="/">Home</a>
          </div>
        </PageContainer>
      </body>
    </html>
  );
}
