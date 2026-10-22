"use client";

import { formatNgnFromKobo, formatUsdc } from "@certa/shared";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Unit = "ngn" | "usdc";

const MoneyContext = createContext<{ unit: Unit; toggle: () => void } | null>(null);

export function MoneyProvider({ children }: { children: ReactNode }) {
  const [unit, setUnit] = useState<Unit>("ngn");
  useEffect(() => {
    const saved = window.localStorage.getItem("certa-money-unit");
    if (saved === "ngn" || saved === "usdc") setUnit(saved);
  }, []);
  function toggle() {
    setUnit((current) => {
      const next = current === "ngn" ? "usdc" : "ngn";
      window.localStorage.setItem("certa-money-unit", next);
      return next;
    });
  }
  return <MoneyContext.Provider value={{ unit, toggle }}>{children}</MoneyContext.Provider>;
}

export function MoneySwitch() {
  const money = useContext(MoneyContext);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!money) return null;
  return (
    <button className="ghost" type="button" data-ready={ready ? "true" : "false"} onClick={money.toggle}>
      Show {money.unit === "ngn" ? "USDC" : "naira"}
    </button>
  );
}

export function MoneyReleased({
  releasedKobo,
  releasedUsdc,
  totalKobo,
  totalUsdc,
}: {
  releasedKobo: string;
  releasedUsdc: string;
  totalKobo: string;
  totalUsdc: string;
}) {
  const money = useContext(MoneyContext);
  const unit = money?.unit ?? "ngn";
  const released = unit === "ngn" ? formatNgnFromKobo(BigInt(releasedKobo)) : formatUsdc(BigInt(releasedUsdc));
  const total = unit === "ngn" ? formatNgnFromKobo(BigInt(totalKobo)) : formatUsdc(BigInt(totalUsdc));
  return (
    <p className="money money-big" data-money>
      {released} of {total} Released
    </p>
  );
}

export function MoneyPair({ kobo, usdc, suffix = "" }: { kobo: string; usdc: string; suffix?: string }) {
  const money = useContext(MoneyContext);
  const unit = money?.unit ?? "ngn";
  const naira = formatNgnFromKobo(BigInt(kobo));
  const dollar = formatUsdc(BigInt(usdc));
  return (
    <div>
      <p className="money money-big" data-money>
        {unit === "ngn" ? naira : dollar}
        {suffix}
      </p>
      <p className="muted money">{unit === "ngn" ? dollar : naira}</p>
    </div>
  );
}

export function MoneyAmount({ kobo, usdc, big = false, unit: forced }: { kobo: string; usdc: string | null; big?: boolean; unit?: Unit }) {
  const money = useContext(MoneyContext);
  const unit = forced ?? money?.unit ?? "ngn";
  const text = unit === "usdc" ? (usdc ? formatUsdc(BigInt(usdc)) : "Rate is not locked yet.") : formatNgnFromKobo(BigInt(kobo));
  return (
    <span className={big ? "money money-big" : "money"} data-money>
      {text}
    </span>
  );
}
