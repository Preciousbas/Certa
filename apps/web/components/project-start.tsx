"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Membership = { projectId: string; name: string; role: string; canInvite: boolean };

const ROLES = [
  ["client", "Client"],
  ["contractor", "Contractor"],
  ["consultant", "Consultant"],
  ["subcontractor", "Subcontractor"],
] as const;

function csrfHeader(): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  const csrf = document.cookie.split("; ").find((row) => row.startsWith("certa_csrf="))?.split("=")[1];
  if (csrf) headers.set("x-csrf-token", decodeURIComponent(csrf));
  return headers;
}

export function ProjectStart({ projects }: { projects: Membership[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number][0]>("client");
  const [code, setCode] = useState("");
  const [inviteRole, setInviteRole] = useState("contractor");
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: csrfHeader(),
        body: JSON.stringify({ name, role }),
      });
      const body = (await response.json()) as { message?: string; projectId?: string };
      if (!response.ok || !body.projectId) {
        setMessage(body.message ?? "The project was not created.");
        return;
      }
      setName("");
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
        headers: csrfHeader(),
        body: JSON.stringify({ code }),
      });
      const body = (await response.json()) as { message?: string; projectId?: string };
      if (!response.ok || !body.projectId) {
        setMessage(body.message ?? "That code is not valid. Check it with the person who sent it.");
        return;
      }
      setCode("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function invite(projectId: string) {
    setPending(true);
    setMessage(null);
    setLink(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/invites`, {
        method: "POST",
        headers: csrfHeader(),
        body: JSON.stringify({ role: inviteRole }),
      });
      const body = (await response.json()) as { message?: string; link?: string };
      if (!response.ok || !body.link) {
        setMessage(body.message ?? "The invite was not created.");
        return;
      }
      setLink(body.link);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack">
      {projects.length === 0 ? (
        <div className="card empty-state">
          <p className="eyebrow">Projects</p>
          <h1>You are not on a project yet.</h1>
          <p className="muted">Start one, or join with a code from the person who invited you.</p>
          <label className="stack">
            Project name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={180} />
          </label>
          <label className="stack">
            Your role
            <select value={role} onChange={(event) => setRole(event.target.value as (typeof ROLES)[number][0])}>
              {ROLES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-block" disabled={pending || name.trim().length === 0} onClick={() => void start()}>
            Start a project
          </button>
          <label className="stack">
            Invite code
            <input value={code} onChange={(event) => setCode(event.target.value)} maxLength={16} autoCapitalize="characters" />
          </label>
          <button type="button" className="ghost btn-block" disabled={pending || code.trim().length < 8} onClick={() => void join()}>
            I have an invite code
          </button>
        </div>
      ) : (
        projects.map((project) => (
          <article key={`${project.projectId}-${project.role}`} className="card">
            <p className="eyebrow">{project.role}</p>
            <h1>{project.name}</h1>
            {project.canInvite ? (
              <div className="stack">
                <label className="stack">
                  Invite as
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                    <option value="contractor">Contractor</option>
                    <option value="consultant">Consultant</option>
                    <option value="subcontractor">Subcontractor</option>
                  </select>
                </label>
                <button type="button" disabled={pending} onClick={() => void invite(project.projectId)}>
                  Invite the other party
                </button>
              </div>
            ) : null}
          </article>
        ))
      )}
      {link ? (
        <p className="card">
          Share this link: <a href={link}>{link}</a>
        </p>
      ) : null}
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
