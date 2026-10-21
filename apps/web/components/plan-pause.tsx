"use client";

import { useState } from "react";

export function PlanPause({ projectId }: { projectId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  async function pause() {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setMessage("Open Certa in Telegram to pause.");
      return;
    }
    const response = await fetch("/api/mini/plan", {
      method: "POST",
      headers: { authorization: `tma ${initData}`, "content-type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    const body = (await response.json()) as { error?: string };
    setMessage(typeof body.error === "string" ? body.error : "Plan updated.");
  }
  return (
    <div>
      <button type="button" onClick={() => void pause()}>
        Pause project
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
