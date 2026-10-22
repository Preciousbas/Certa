"use client";

import { useState } from "react";

export function ReviewActions({
  projectId,
  stageId,
  needsReason = false,
}: {
  projectId: string;
  stageId: string;
  needsReason?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function send(decision: "approve" | "reject") {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setMessage("Open Certa in Telegram to review this stage.");
      return;
    }
    if (needsReason && reason.trim().length < 20) {
      setMessage("Write at least 20 characters so the override is on the record.");
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

  if (needsReason) {
    return (
      <div>
        <label className="stack">
          <span className="faint">Reason for sending this stage on</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <button type="button" onClick={() => void send("approve")}>
          Send this stage on
        </button>
        {message ? <p className="muted">{message}</p> : null}
      </div>
    );
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
