"use client";

import { useEffect, useState } from "react";
import { InviteForm } from "../../../../../components/invite-form";
import { peopleAuthState } from "../../../../../lib/people-auth";

type Person = { name: string; role: string; notifyChannel: string | null };

function requestHeaders(): Headers {
  const headers = new Headers();
  const initData = window.Telegram?.WebApp?.initData;
  if (initData) headers.set("authorization", `tma ${initData}`);
  const csrf = document.cookie.split("; ").find((row) => row.startsWith("certa_csrf="))?.split("=")[1];
  if (csrf) headers.set("x-csrf-token", decodeURIComponent(csrf));
  return headers;
}

export default function PeoplePage() {
  const [telegramReady, setTelegramReady] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [hasInitData, setHasInitData] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = () => {
      const initData = window.Telegram?.WebApp?.initData ?? "";
      setHasInitData(initData.length > 0);
      setTelegramReady(true);
      const projectId = window.location.pathname.split("/").at(3) ?? "";
      void fetch(`/api/projects/${projectId}/people`, { headers: requestHeaders() })
        .then(async (response) => {
          if (stop) return;
          setStatus(response.status);
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { message?: string } | null;
            setMessage(body?.message ?? null);
            return;
          }
          const body = (await response.json()) as { project?: string; people?: Person[] };
          setProjectName(body.project ?? "");
          setPeople(body.people ?? []);
        })
        .catch(() => {
          if (!stop) setStatus(500);
        });
    };
    if (window.Telegram?.WebApp) load();
    window.addEventListener("certa-telegram-ready", load);
    const timer = window.setTimeout(load, 1500);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      window.removeEventListener("certa-telegram-ready", load);
    };
  }, []);

  const state = peopleAuthState({ telegramReady, status, hasInitData });
  const projectId = typeof window === "undefined" ? "" : (window.location.pathname.split("/").at(3) ?? "");

  if (state === "loading") return <p className="muted">Loading people.</p>;
  if (state === "sign-in") return <p>Sign in from Telegram.</p>;
  if (state === "forbidden") return <p>{message ?? "You don't have permission to do this on this project."}</p>;
  if (state === "error") return <p>{message ?? "Something went wrong loading people. Try again."}</p>;

  return (
    <div>
      <p className="eyebrow">People</p>
      <h1>{projectName}</h1>
      {people.length === 0 ? <p className="muted">Nobody has joined this project yet.</p> : null}
      <InviteForm projectId={projectId} />
      <ul>
        {people.map((row) => (
          <li key={`${row.role}-${row.name}`}>
            {row.name} · {row.role}
            {row.notifyChannel === "blocked" ? " · Bot blocked" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
