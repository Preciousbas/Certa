"use client";

import { useState, type FormEvent } from "react";

export function ChangeActions({ projectId, changeId }: { projectId: string; changeId: string }) {
  const [reason, setReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function send(decision: "accept" | "decline") {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setMessage("Open Certa in Telegram to answer.");
      return;
    }
    if (decision === "decline" && reason.trim().length === 0) {
      setMessage("A no needs a reason.");
      return;
    }
    const response = await fetch("/api/mini/changes", {
      method: "POST",
      headers: { authorization: `tma ${initData}`, "content-type": "application/json" },
      body: JSON.stringify({ projectId, changeId, decision, reason: reason.trim() || undefined }),
    });
    const body = (await response.json()) as { error?: string };
    setMessage(typeof body.error === "string" ? body.error : "Could not save that answer.");
  }

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
      }}
    >
      <div className="actions">
        <button type="button" onClick={() => void send("accept")}>
          Accept
        </button>
        <button className="ghost" type="button" onClick={() => setDeclining(true)}>
          Decline
        </button>
      </div>
      {declining ? (
        <label className="stack">
          <span className="faint">Reason</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} required />
          <button type="button" onClick={() => void send("decline")}>
            Send the no
          </button>
        </label>
      ) : null}
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
