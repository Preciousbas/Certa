"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Membership = { projectId: string; name: string; role: string; canInvite: boolean };
type Side = "client" | "contractor";

function headersFor(): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  const initData = window.Telegram?.WebApp?.initData;
  if (initData) headers.set("authorization", `tma ${initData}`);
  const csrf = document.cookie.split("; ").find((row) => row.startsWith("certa_csrf="))?.split("=")[1];
  if (csrf) headers.set("x-csrf-token", decodeURIComponent(csrf));
  return headers;
}

export function ProjectStart({ initial, signedIn }: { initial: Membership[]; signedIn: boolean }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initial);
  const [ready, setReady] = useState(signedIn);
  const [asking, setAsking] = useState<"start" | "join" | null>(null);
  const [name, setName] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (signedIn) return;
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    let stop = false;
    void fetch("/api/projects", { headers: headersFor() })
      .then(async (response) => {
        if (!response.ok || stop) return;
        const body = (await response.json()) as { projects?: Membership[] };
        if (body.projects) setProjects(body.projects);
        setReady(true);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [signedIn]);

  async function start(role: Side) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: headersFor(),
        body: JSON.stringify({ name, role }),
      });
      const body = (await response.json()) as { message?: string; link?: string; code?: string };
      if (!response.ok || !body.link || !body.code) {
        setMessage(body.message ?? "The project was not created.");
        return;
      }
      setLink(body.link);
      setCode(body.code);
      setAsking(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function join() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/projects/join", {
        method: "POST",
        headers: headersFor(),
        body: JSON.stringify({ code: linkInput }),
      });
      const body = (await response.json()) as { message?: string; projectId?: string };
      if (!response.ok || !body.projectId) {
        setMessage(body.message ?? "That code is not valid. Check it with the person who sent it.");
        return;
      }
      setMessage(body.message ?? "You've joined the project.");
      setLinkInput("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function revoke(projectId: string) {
    if (!code) return;
    setPending(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/invites`, {
        method: "POST",
        headers: headersFor(),
        body: JSON.stringify({ revokeCode: code }),
      });
      const body = (await response.json()) as { message?: string; ok?: boolean };
      if (!response.ok) {
        setMessage(body.message ?? "The invite was not revoked.");
        return;
      }
      setLink(null);
      setCode(null);
      setMessage("That invite was revoked.");
    } finally {
      setPending(false);
    }
  }

  if (!ready && !signedIn && typeof window !== "undefined" && window.Telegram?.WebApp?.initData) {
    return null;
  }

  if (projects.length === 0) {
    return (
      <div className="card empty-state">
        <p className="eyebrow">Projects</p>
        <h1>You're not on any project yet.</h1>
        <p>Create one in Telegram, or ask for a join code.</p>
        <a className="ui-btn ui-btn-primary" href="https://t.me/CertaApp_bot">Open in Telegram</a>
        {asking === "start" ? (
          <div className="stack">
            <p>Are you the Client or the Contractor?</p>
            <label className="stack">
              Project name
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={180} />
            </label>
            <button type="button" disabled={pending || name.trim().length === 0} onClick={() => void start("contractor")}>
              Contractor
            </button>
            <button type="button" className="ghost" disabled={pending || name.trim().length === 0} onClick={() => void start("client")}>
              Client (e.g. a government agency)
            </button>
          </div>
        ) : (
          <button type="button" className="btn-block" onClick={() => setAsking("start")}>
            Start a project
          </button>
        )}
        {asking === "join" ? (
          <div className="stack">
            <label className="stack">
              Invite link
              <input value={linkInput} onChange={(event) => setLinkInput(event.target.value)} />
            </label>
            <button type="button" className="ghost" disabled={pending || linkInput.trim().length < 8} onClick={() => void join()}>
              Join
            </button>
          </div>
        ) : (
          <button type="button" className="ghost btn-block" onClick={() => setAsking("join")}>
            I have an invite link
          </button>
        )}
        {link ? (
          <p className="stack">
            Share this link: <a href={link}>{link}</a>
          </p>
        ) : null}
        {message ? <p className="muted">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="stack">
      {projects.map((project) => (
        <article key={`${project.projectId}-${project.role}`} className="card">
          <p className="eyebrow">{project.role}</p>
          <h1>{project.name}</h1>
          {link && code ? (
            <div className="stack">
              <p>
                Share this link: <a href={link}>{link}</a>
              </p>
              <button type="button" className="ghost" disabled={pending} onClick={() => void revoke(project.projectId)}>
                Revoke invite
              </button>
            </div>
          ) : null}
        </article>
      ))}
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
