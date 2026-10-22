"use client";

import { useEffect, useState } from "react";

const CONFIRM = "By accepting, you agree that these stages and amounts are the payment plan for this project. Any later change needs both of you to accept again.";

type Row = {
  code: string;
  field: string;
  value: string;
  severity: string;
  anchor: string | null;
  quote: string | null;
  kept: boolean;
  stageIndex: number | null;
};

type Review = {
  empty?: boolean;
  contractSumLabel: string;
  stageTotalLabel: string;
  match: boolean;
  issues: Row[];
  message?: string;
};

function authHeaders(): Headers {
  const headers = new Headers();
  const initData = window.Telegram?.WebApp?.initData;
  if (initData) headers.set("authorization", `tma ${initData}`);
  const csrf = document.cookie.split("; ").find((row) => row.startsWith("certa_csrf="))?.split("=")[1];
  if (csrf) headers.set("x-csrf-token", decodeURIComponent(csrf));
  return headers;
}

function projectIdFromPath(): string {
  return window.location.pathname.split("/")[3] ?? "";
}

function rowKey(row: Row, index: number): string {
  return `${row.code}:${row.anchor ?? index}`;
}

export default function ReviewPage() {
  const [state, setState] = useState<"loading" | "error" | "empty" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const headers = authHeaders();
    void fetch(`/api/projects/${projectIdFromPath()}/contract`, { headers })
      .then(async (response) => {
        const body = (await response.json()) as Review;
        if (!response.ok) {
          setState("error");
          setError(body.message ?? "The figures could not be loaded.");
          return;
        }
        if (body.empty) {
          setState("empty");
          return;
        }
        setReview(body);
        setState("ready");
      })
      .catch(() => {
        setState("error");
        setError("The figures could not be loaded.");
      });
  }, []);

  async function act(row: Row, action: "correct" | "keep") {
    const headers = authHeaders();
    headers.set("content-type", "application/json");
    const response = await fetch(`/api/projects/${projectIdFromPath()}/contract`, {
      method: "POST",
      headers,
      body: JSON.stringify({ action, code: row.code, anchor: row.anchor, stageIndex: row.stageIndex, value: draft }),
    });
    const body = (await response.json()) as Review;
    if (!response.ok) {
      setMessage(body.message ?? "That change was not saved.");
      return;
    }
    setReview(body);
    setEditing(null);
    setMessage(action === "keep" ? "Kept." : "Corrected. The stage total was checked again.");
  }

  async function send() {
    const headers = authHeaders();
    headers.set("content-type", "application/json");
    const response = await fetch(`/api/projects/${projectIdFromPath()}/contract`, { method: "POST", headers, body: JSON.stringify({ send: true }) });
    const body = (await response.json()) as { message?: string };
    setMessage(body.message ?? (response.ok ? "Sent to the contractor." : "Totals don't reconcile yet: fix the red items before sending."));
  }

  return (
    <div>
      <p className="eyebrow">Review</p>
      <h1>Check the figures</h1>
      {state === "loading" ? <p className="muted">Reading the figures.</p> : null}
      {state === "error" ? <p className="toast">{error}</p> : null}
      {state === "empty" ? <p className="muted">No figures yet. Upload a contract or BoQ first.</p> : null}
      {state === "ready" && review ? (
        <>
          <section className="card">
            <p>Contract sum {review.contractSumLabel}</p>
            <p>Stage total {review.stageTotalLabel}</p>
            <p className="muted">{review.match ? "The stage total matches the contract sum." : "The stage total does not match the contract sum."}</p>
          </section>
          {review.issues.length === 0 ? <p className="muted">Nothing to check. The figures have a source.</p> : null}
          <ul className="plain">
            {review.issues.map((row, index) => {
              const key = rowKey(row, index);
              return (
                <li key={key} className="card">
                  <p className="eyebrow">{row.severity}</p>
                  <p>{row.field}</p>
                  <p>{row.kept ? `Kept: ${row.value}` : row.value}</p>
                  <button type="button" className="ghost" onClick={() => setOpenKey(openKey === key ? null : key)}>
                    {row.anchor ?? "Source"} {row.quote ? row.quote.slice(0, 42) : ""}
                  </button>
                  {openKey === key ? <p className="muted">{row.quote ?? "No source text was stored for this figure."}</p> : null}
                  {editing === key ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void act(row, "correct");
                      }}
                    >
                      <input value={draft} onChange={(event) => setDraft(event.target.value)} inputMode="decimal" aria-label={`Correct ${row.field}`} />
                      <button type="submit" className="btn-block">Correct</button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="btn-block"
                      onClick={() => {
                        setEditing(key);
                        setDraft("");
                      }}
                    >
                      Correct
                    </button>
                  )}
                  <button type="button" className="ghost btn-block" onClick={() => void act(row, "keep")}>
                    Keep
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn-block" onClick={() => void send()}>Send to contractor for agreement</button>
          <button type="button" className="ghost btn-block" onClick={() => setConfirming(true)}>Accept plan</button>
          {confirming ? (
            <div className="card">
              <p>{CONFIRM}</p>
              <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          ) : null}
        </>
      ) : null}
      {message ? <p className="toast">{message}</p> : null}
    </div>
  );
}
