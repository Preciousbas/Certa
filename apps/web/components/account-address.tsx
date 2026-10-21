"use client";

import { useState } from "react";
import { SEPOLIA_CHAIN_ID, explorerAddress, explorerLabel } from "../lib/explorer";

export function AccountAddress({ address }: { address: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!address) return <p>Being created…</p>;
  return (
    <div>
      <p className="address">{address}</p>
      <div className="actions">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(address).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <a className="btn" href={explorerAddress(SEPOLIA_CHAIN_ID, address)}>
          {explorerLabel(SEPOLIA_CHAIN_ID)}
        </a>
      </div>
    </div>
  );
}
