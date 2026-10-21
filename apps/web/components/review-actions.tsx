"use client";

import { useState } from "react";

export function ReviewActions({ projectId, stageId }: { projectId: string; stageId: string }) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function send(decision: "approve" | "reject") {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setMessage("Open Certa in Telegram to review this stage.");
      return;
    }
    if (decision === "reject" && reason.trim().length === 0) {
      setMessage("A no needs a reason.");
      return;
    }
    const response = await fetch("/api/mini/review", {
      method: "POST",
      headers: { authorization: `tma ${initData}`, "content-type": "application/json" },
      body: JSON.stringify({ projectId, stageId, decision, reason: reason.trim() || undefined }),
    });
    const body = (await response.json()) as { error?: string; message?: string; moneyMoved?: boolean };
    if (body.moneyMoved === false) setMessage("Recorded. The money stays locked.");
    else setMessage(body.message ?? body.error ?? "Could not save that review.");
  }

  return (
    <div>
      <div className="actions">
        <button type="button" onClick={() => void send("approve")}>
          Approve
        </button>
        <button className="ghost" type="button" onClick={() => setRejecting(true)}>
          Reject
        </button>
      </div>
      {rejecting ? (
        <label className="stack">
          <span className="faint">Reason</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} required />
          <button type="button" onClick={() => void send("reject")}>
            Send the no
          </button>
        </label>
      ) : null}
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
