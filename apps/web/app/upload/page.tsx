"use client";

import { useState } from "react";

type Preview = {
  contractSum: string;
  stages: { number: number; name: string; amount: string; criteria: string }[];
  issues: string[];
};

export default function UploadPage() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  async function onFile(file: File | null) {
    if (!file) return;
    setPending(true);
    setMessage(null);
    setPreview(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/contract/preview", { method: "POST", body });
      const json = (await response.json()) as Partial<Preview> & { error?: string };
      if (!response.ok || !json.stages || !json.contractSum) {
        setMessage(json.error ?? "That file could not be read.");
        return;
      }
      setPreview({ contractSum: json.contractSum, stages: json.stages, issues: json.issues ?? [] });
    } catch {
      setMessage("That file could not be read.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <p className="eyebrow">Contract</p>
      <h1>Upload the bill</h1>
      <p className="muted">Send the Excel, CSV, Word, or PDF. Each row is checked: quantity times rate must equal the amount. Both sides accept in Telegram before any money is locked.</p>
      <form
        onSubmit={(event) => event.preventDefault()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void onFile(event.dataTransfer.files[0] ?? null);
        }}
      >
        <label className="card" style={{ display: "block", cursor: "pointer" }}>
          {pending ? "Reading the file" : "Drop the file here, or choose it"}
          <input
            type="file"
            accept=".pdf,.docx,.xlsx,.xls,.csv,.txt"
            style={{ display: "block", marginTop: 12 }}
            onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
          />
        </label>
      </form>
      {message ? <p className="toast">{message}</p> : null}
      {preview ? (
        <article className="card" style={{ marginTop: 16 }}>
          <p className="eyebrow">Schedule</p>
          <h2>{preview.contractSum}</h2>
          {preview.issues.length > 0 ? (
            <ul className="plain">
              {preview.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">The rows add up. Send this file to the bot and both sides reply accept.</p>
          )}
          <ol className="plain">
            {preview.stages.map((stage) => (
              <li key={stage.number}>
                {stage.number}. {stage.name} — {stage.amount}
                <div className="faint">{stage.criteria}</div>
              </li>
            ))}
          </ol>
        </article>
      ) : null}
    </div>
  );
}
