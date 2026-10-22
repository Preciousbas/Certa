"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ProjectStart } from "./project-start";

export function MiniHome({ children }: { children: ReactNode }) {
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    const headers = new Headers();
    headers.set("authorization", `tma ${initData}`);
    void fetch("/api/projects", { headers })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { projects?: unknown[] };
        if (body.projects && body.projects.length === 0) setEmpty(true);
      })
      .catch(() => undefined);
  }, []);

  if (empty) return <ProjectStart initial={[]} signedIn={false} />;
  return children;
}
