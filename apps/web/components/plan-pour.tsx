"use client";

import { useState } from "react";

export function PlanPour({ projectId, stageId }: { projectId: string; stageId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pour() {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setMessage("Open Certa in Telegram to plan this pour.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/mini/pour", {
      method: "POST",
      headers: { authorization: `tma ${initData}`, "content-type": "application/json" },
      body: JSON.stringify({ projectId, stageId }),
    });
    const body = (await response.json()) as { message?: string; error?: string };
    setBusy(false);
    if (response.ok) setMessage("Certa is checking the weather. You'll get the result in Telegram.");
    else setMessage(body.message ?? body.error ?? "The weather check was not queued.");
  }

  return (
    <div>
      <button type="button" onClick={() => void pour()} disabled={busy}>
        Planning to pour
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
