"use client";

import { useState } from "react";

export function MoneyToggle({ ngn, usdc }: { ngn: string; usdc: string }) {
  const [unit, setUnit] = useState<"ngn" | "usdc">("ngn");
  return (
    <div>
      <p style={{ fontSize: "1.7rem", margin: "0.2rem 0 0.6rem" }}>{unit === "ngn" ? ngn : usdc}</p>
      <button className="ghost" type="button" onClick={() => setUnit(unit === "ngn" ? "usdc" : "ngn")}>
        Show {unit === "ngn" ? "USDC" : "naira"}
      </button>
    </div>
  );
}
