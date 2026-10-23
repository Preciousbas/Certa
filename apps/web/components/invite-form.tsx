"use client";

import { useState } from "react";

export function InviteForm({ projectId }: { projectId: string }) {
  const [role, setRole] = useState("consultant");
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function send() {
    setPending(true);
    setMessage(null);
    const headers = new Headers({ "content-type": "application/json" });
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) headers.set("authorization", `tma ${initData}`);
    const csrf = document.cookie.split("; ").find((row) => row.startsWith("certa_csrf="))?.split("=")[1];
    if (csrf) headers.set("x-csrf-token", decodeURIComponent(csrf));
    const response = await fetch(`/api/projects/${projectId}/invites`, {
      method: "POST",
      headers,
      body: JSON.stringify({ role }),
    });
    const body = (await response.json()) as { link?: string; message?: string };
    setPending(false);
    if (!response.ok || !body.link) {
      setMessage(body.message ?? "The join link was not created.");
      return;
    }
    setLink(body.link);
    setMessage("Join link ready.");
  }

  return (
    <form
      className="card stack"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <h2>Invite</h2>
      <label>
        Role
        <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Invite role">
          <option value="consultant">Consultant</option>
          <option value="subcontractor">Subcontractor</option>
        </select>
      </label>
      <button className="ui-btn ui-btn-secondary" type="submit" disabled={pending}>
        {pending ? "Working…" : "Create join link"}
      </button>
      {link ? (
        <p>
          <a href={link}>{link}</a>{" "}
          <button
            className="ui-btn ui-btn-ghost"
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(link);
              setMessage("Copied.");
            }}
          >
            Copy
          </button>
        </p>
      ) : null}
      {message ? <p className="muted">{message}</p> : null}
    </form>
  );
}
