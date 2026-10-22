"use client";

import { useEffect, useState } from "react";

export function Deadline({ deadline }: { deadline: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (now == null) return <p className="faint">Reply window is open.</p>;
  const left = new Date(deadline).getTime() - now;
  if (left <= 0) return <p className="faint">The reply window has closed.</p>;
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  return <p className="faint">{hours}h {minutes}m left to reply.</p>;
}
