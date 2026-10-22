"use client";

import { useEffect, useId, useRef, useState } from "react";
import { proposeChange } from "../app/changes/actions";
import { Toast } from "./ui/dialog";

type StageOption = { id: string; label: string };

export function ProposeChange({ stages }: { stages: StageOption[] }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [type, setType] = useState("add");
  const [amount, setAmount] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function onSubmit(formData: FormData) {
    setPending(true);
    const result = await proposeChange(formData);
    setPending(false);
    setMessage(result.message);
    if (result.ok) {
      setOpen(false);
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    } else {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
    }
  }

  const reduces = type === "omit" && amount.trim().length > 0;
  return (
    <div>
      <button type="button" className={open ? "ui-btn ui-btn-secondary" : "ui-btn ui-btn-primary"} onClick={() => setOpen(true)}>
        Propose change
      </button>
      {open ? <dialog
        ref={dialogRef}
        className="propose-dialog"
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
      >
        <form action={onSubmit}>
          <h2 id={titleId}>Propose change</h2>
          <label>
            Title
            <input name="title" required minLength={5} maxLength={80} />
          </label>
          <label>
            What's changing
            <textarea name="description" required minLength={20} maxLength={1000} />
          </label>
          <label>
            Type
            <select name="type" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="add">Add work</option>
              <option value="omit">Remove work</option>
              <option value="alter">Change work</option>
            </select>
          </label>
          <label>
            Amount in naira
            <input name="amount" inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} aria-describedby="amount-help" />
          </label>
          <p id="amount-help" className="muted">{reduces ? `This reduces the contract by ${amount}.` : "Use naira, for example 250000."}</p>
          <label>
            Affects stage
            <select name="stageId" defaultValue="new">
              <option value="new">New stage</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>{stage.label}</option>
              ))}
            </select>
          </label>
          <label>
            Attach photos or documents
            <input name="files" type="file" multiple disabled aria-describedby="files-note" />
          </label>
          <p id="files-note" className="muted">Attachments on this form are not saved yet. Send them in Telegram.</p>
          <div className="actions">
            <button className="ui-btn ui-btn-primary" type="submit" disabled={pending}>{pending ? "Working…" : "Send for agreement"}</button>
            <button className="ui-btn ui-btn-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      </dialog> : null}
      <Toast message={message} />
    </div>
  );
}
