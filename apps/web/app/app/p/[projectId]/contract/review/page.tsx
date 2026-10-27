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

type StageItem = { id: string; label: string };

type StageCard = {
  number: number;
  name: string;
  amountLabel: string;
  itemCount: number;
  items: StageItem[];
  expectedFinish: string | null;
  kind: string;
  source: string;
  boqLabel?: string;
};

type Review = {
  empty?: boolean;
  contractSumLabel: string;
  stageTotalLabel: string;
  stageCountLabel?: string;
  match: boolean;
  basis?: string;
  locked?: boolean;
  canEdit?: boolean;
  items?: { label: string }[];
  stages?: StageCard[];
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

function waitForInitData(timeoutMs = 4000): Promise<void> {
  if (window.Telegram?.WebApp?.initData) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      window.removeEventListener("certa-telegram-ready", finish);
      resolve();
    };
    window.addEventListener("certa-telegram-ready", finish);
    const poll = window.setInterval(() => {
      if (window.Telegram?.WebApp?.initData) finish();
    }, 100);
    const timeout = window.setTimeout(finish, timeoutMs);
  });
}

function projectIdFromPath(): string {
  return window.location.pathname.split("/")[3] ?? "";
}

function whole(value: string): number {
  let out = 0;
  for (const char of value) {
    if (char < "0" || char > "9") break;
    out = out * 10 + (char.charCodeAt(0) - 48);
  }
  return out;
}

function rowKey(row: Row, index: number): string {
  return `${row.code}:${row.anchor ?? index}`;
}

function StageEditor({
  stage,
  stages,
  basis,
  canEdit,
  onEdit,
}: {
  stage: StageCard;
  stages: StageCard[];
  basis: string;
  canEdit: boolean;
  onEdit: (edit: Record<string, unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(stage.name);
  const [date, setDate] = useState(stage.expectedFinish ?? "");
  const [into, setInto] = useState("");
  const others = stages.filter((item) => item.number !== stage.number && item.kind !== "reserve");
  const editable = canEdit && stage.kind !== "reserve";
  return (
    <section className="card">
      <p className="eyebrow">Stage {stage.number}</p>
      <p>{stage.name}</p>
      <p>{stage.amountLabel} · {stage.itemCount} items</p>
      <p className="muted">{stage.expectedFinish ? `Finish ${stage.expectedFinish}` : "No finish date"}</p>
      {stage.boqLabel ? <p className="muted">BoQ items add up to {stage.boqLabel}. This stage stays {stage.amountLabel}.</p> : null}
      <button type="button" className="ghost" onClick={() => setOpen(!open)}>{open ? "Hide items" : "Show items"}</button>
      {open ? (
        <ul className="plain">
          {stage.items.map((item) => (
            <li key={item.id}>
              {item.label}
              {editable && basis === "boq_grouping" ? (
                <select aria-label={`Move ${item.label}`} defaultValue="" onChange={(event) => {
                  const toNumber = whole(event.target.value);
                  if (toNumber) void onEdit({ op: "move_item", itemId: item.id, toNumber });
                }}>
                  <option value="">Move to stage</option>
                  {others.map((itemStage) => (
                    <option key={itemStage.number} value={itemStage.number}>{itemStage.number}. {itemStage.name}</option>
                  ))}
                </select>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {editable ? (
        <>
          <form onSubmit={(event) => { event.preventDefault(); void onEdit({ op: "rename", number: stage.number, name }); }}>
            <input value={name} onChange={(event) => setName(event.target.value)} aria-label={`Rename stage ${stage.number}`} />
            <button type="submit" className="ghost">Rename</button>
          </form>
          <form onSubmit={(event) => { event.preventDefault(); void onEdit({ op: "set_finish", number: stage.number, date: date || null }); }}>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label={`Finish date for stage ${stage.number}`} />
            <button type="submit" className="ghost">Finish date</button>
          </form>
          <button type="button" className="ghost" onClick={() => void onEdit({ op: "merge", number: stage.number })}>Merge with next</button>
          <form onSubmit={(event) => { event.preventDefault(); void onEdit({ op: "remove", number: stage.number, into: into ? whole(into) : null }); }}>
            <select value={into} onChange={(event) => setInto(event.target.value)} aria-label={`Remove stage ${stage.number} into`}>
              <option value="">Into the previous stage</option>
              {others.map((itemStage) => (
                <option key={itemStage.number} value={itemStage.number}>{itemStage.number}. {itemStage.name}</option>
              ))}
            </select>
            <button type="submit" className="ghost">Remove</button>
          </form>
        </>
      ) : null}
    </section>
  );
}

function AddStage({ basis, onEdit }: { basis: string; onEdit: (edit: Record<string, unknown>) => Promise<void> }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <form className="card" onSubmit={(event) => { event.preventDefault(); void onEdit({ op: "add", name, amount }); }}>
      <p className="eyebrow">Add stage</p>
      <input value={name} onChange={(event) => setName(event.target.value)} aria-label="New stage name" placeholder="Stage name" />
      {basis === "contract_milestones" ? <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" aria-label="New stage amount" placeholder="1000.00" /> : null}
      <button type="submit" className="btn-block">Add stage</button>
    </form>
  );
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
    let cancelled = false;
    void (async () => {
      await waitForInitData();
      if (cancelled) return;
      const read = (headers: Headers) =>
        fetch(`/api/projects/${projectIdFromPath()}/contract`, { headers }).then(async (response) => ({
          response,
          body: (await response.json()) as Review,
        }));
      try {
        let result = await read(authHeaders());
        if (result.response.status === 401) {
          await new Promise((resolve) => window.setTimeout(resolve, 800));
          if (cancelled) return;
          result = await read(authHeaders());
        }
        if (cancelled) return;
        const { response, body } = result;
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
      } catch {
        if (cancelled) return;
        setState("error");
        setError("The figures could not be loaded.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function act(row: Row, action: "correct" | "keep") {
    await waitForInitData();
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

  async function confirmAccept() {
    await waitForInitData();
    const headers = authHeaders();
    headers.set("content-type", "application/json");
    try {
      const response = await fetch(`/api/projects/${projectIdFromPath()}/contract`, {
        method: "POST",
        headers,
        body: JSON.stringify({ decision: "accepted" }),
      });
      const body = (await response.json()) as { message?: string };
      setConfirming(false);
      if (!response.ok) {
        setMessage(body.message ?? "The plan was not accepted.");
        return;
      }
      setMessage(body.message ?? "Accepted.");
    } catch {
      setConfirming(false);
      setMessage("The plan was not accepted.");
    }
  }

  async function stageEdit(edit: Record<string, unknown>) {
    await waitForInitData();
    const headers = authHeaders();
    headers.set("content-type", "application/json");
    const response = await fetch(`/api/projects/${projectIdFromPath()}/contract`, {
      method: "POST",
      headers,
      body: JSON.stringify({ stageEdit: edit }),
    });
    const body = (await response.json()) as Review;
    if (!response.ok) {
      setMessage(body.message ?? "That change was not saved.");
      return;
    }
    setReview(body);
    setMessage(body.message ?? "Saved.");
  }

  async function send() {
    await waitForInitData();
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
            <p>{review.stageCountLabel ?? "Stages"} · stage total {review.stageTotalLabel}</p>
            <p className="muted">{review.match ? "The stage total matches the contract sum." : "The stage total does not match the contract sum."}</p>
          </section>
          {(review.stages ?? []).some((stage) => stage.source === "model") ? <p className="muted">Read by AI — please check each stage.</p> : null}
          {review.locked ? <p className="toast">This plan is agreed. Propose a change instead — both sides must accept it.</p> : null}
          {(review.stages ?? []).map((stage) => (
            <StageEditor key={stage.number} stage={stage} stages={review.stages ?? []} basis={review.basis ?? "boq_grouping"} canEdit={review.canEdit === true} onEdit={stageEdit} />
          ))}
          {review.canEdit ? <AddStage basis={review.basis ?? "boq_grouping"} onEdit={stageEdit} /> : null}
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
              <button type="button" className="btn-block" onClick={() => void confirmAccept()}>Confirm</button>
              <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          ) : null}
        </>
      ) : null}
      {message ? <p className="toast">{message}</p> : null}
    </div>
  );
}
