"use client";

import { useRef, useState, type FormEvent } from "react";
import { formatNaira } from "../../../src/lib/money/kobo";
import { formatUsdc } from "../../../src/lib/money/usdc";
import { SEPOLIA_CHAIN_ID, explorerAddress, explorerTx } from "../lib/explorer";
import { MoneyAmount } from "./money";
import { useMoneyUnit } from "./money";
import { useTelegramMainButton } from "./telegram";
import { NO_STAGES_TO_FUND, showFundLock } from "../lib/fund-lock";
import { ConfirmDialog } from "./ui/dialog";
import { SegmentedToggle } from "./ui/button";

type StageLine = { name: string; kobo: string; usdc: string; funded: boolean };

type FundReceipt = {
  amountNgnKobo: string;
  amountUsdc: string;
  status: "pending" | "confirmed";
  txHash: string | null;
  escrowAddress: string | null;
  rail: "usdc" | "ngn";
  contractorNotified: boolean;
  stages: { name: string; amountNgnKobo: string; amountUsdc: string }[];
  created: boolean;
};

type Props = { projectId: string; defaultUpTo: number; stages: StageLine[]; rateLabel: string };

function shortUsdc(micro: bigint): string {
  const full = formatUsdc(micro, { dp: 2 });
  const [num, unit] = full.split(" ");
  if (!num || !unit) return full;
  return `${num.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")} ${unit}`;
}

export function FundForm({ projectId, defaultUpTo, stages, rateLabel }: Props) {
  const money = useMoneyUnit();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [receipt, setReceipt] = useState<FundReceipt | null>(null);
  const [mode, setMode] = useState<"full" | "part">("part");
  const [upTo, setUpTo] = useState(defaultUpTo);
  const key = useRef<string | null>(null);
  const open = stages.filter((stage) => !stage.funded);
  const limit = mode === "full" ? stages.length - 1 : upTo;
  const covered = stages.slice(0, limit + 1).filter((stage) => !stage.funded);
  const lines = covered.length > 0 ? covered : open;
  const kobo = lines.reduce((sum, stage) => sum + BigInt(stage.kobo), 0n);
  const usdc = lines.reduce((sum, stage) => sum + BigInt(stage.usdc), 0n);
  const nairaLabel = formatNaira(kobo);
  const usdcLabel = shortUsdc(usdc);
  const stageSpan = lines.length === 0 ? "none" : `stages 1–${limit + 1}`;
  const canLock = showFundLock(stages.length, kobo);

  async function onSubmit(event?: FormEvent) {
    event?.preventDefault();
    setConfirm(false);
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setMessage("Open Certa in Telegram to lock this money.");
      return;
    }
    key.current ??= crypto.randomUUID();
    setPending(true);
    setMessage("Locking… waiting for the network (usually under 30 seconds).");
    try {
      const response = await fetch("/api/mini/fund", {
        method: "POST",
        headers: { authorization: `tma ${initData}`, "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          upToStage: limit,
          idempotencyKey: key.current,
          currency: "usdc",
        }),
      });
      const body = (await response.json()) as Partial<FundReceipt> & { error?: string; message?: string };
      if (!response.ok || !body.amountNgnKobo || !body.amountUsdc || !body.stages) {
        if (!response.ok) key.current = null;
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
        setMessage(`The payment didn't go through: ${body.message ?? body.error ?? "the network did not confirm it"}. No money was moved.`);
        return;
      }
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      setMessage(null);
      setReceipt({
        amountNgnKobo: body.amountNgnKobo,
        amountUsdc: body.amountUsdc,
        status: body.status === "confirmed" ? "confirmed" : "pending",
        txHash: body.txHash ?? null,
        escrowAddress: body.escrowAddress ?? null,
        rail: body.rail === "ngn" ? "ngn" : "usdc",
        contractorNotified: Boolean(body.contractorNotified),
        stages: body.stages,
        created: Boolean(body.created),
      });
    } catch {
      key.current = null;
      setMessage("The payment didn't go through: the connection dropped. No money was moved.");
    } finally {
      setPending(false);
    }
  }

  useTelegramMainButton(`Lock ${nairaLabel} in escrow`, () => setConfirm(true), !receipt && !pending && canLock);

  if (receipt) {
    const proof = receipt.txHash ? explorerTx(SEPOLIA_CHAIN_ID, receipt.txHash) : "";
    return (
      <section className="card confirm">
        <h1>{receipt.txHash ? "Locked." : "Waiting on chain."}</h1>
        <MoneyAmount kobo={receipt.amountNgnKobo} usdc={receipt.amountUsdc} big />
        <ul className="plain">
          {receipt.stages.map((stage) => (
            <li className="row" key={stage.name}>
              <span>{stage.name}</span>
              <MoneyAmount kobo={stage.amountNgnKobo} usdc={stage.amountUsdc} />
            </li>
          ))}
        </ul>
        {receipt.escrowAddress ? (
          <p>
            <a href={explorerAddress(SEPOLIA_CHAIN_ID, receipt.escrowAddress)}>Escrow on Etherscan</a>
          </p>
        ) : (
          <p>Escrow is not on chain yet.</p>
        )}
        {proof ? (
          <p>
            <a href={proof}>Proof on Etherscan</a>
          </p>
        ) : (
          <p>The proof link appears when the network confirms it.</p>
        )}
        <p>{receipt.contractorNotified ? "Contractor notified." : "Contractor not notified yet."}</p>
      </section>
    );
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); setConfirm(true); }}>
      <p className="eyebrow">Fund</p>
      <h1>Lock the stage payments</h1>
      <p className="muted">Money stays locked until a stage is approved. The rate on this contract is {rateLabel} per USDC.</p>
      <SegmentedToggle
        label="How much to lock"
        value={mode}
        options={[{ value: "full", label: "Full contract sum" }, { value: "part", label: "Part-payment" }]}
        onChange={(value) => setMode(value === "full" ? "full" : "part")}
      />
      {mode === "part" ? (
        <label>
          Cover up to stage
          <select value={upTo} onChange={(event) => setUpTo(Number(event.target.value))}>
            {stages.map((stage, index) => (
              <option key={stage.name} value={index}>{index + 1}. {stage.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      <SegmentedToggle
        label="Show in"
        value={money.unit}
        options={[{ value: "ngn", label: "Naira" }, { value: "usdc", label: "USDC" }]}
        onChange={(value) => money.setUnit(value === "usdc" ? "usdc" : "ngn")}
      />
      <div className="card">
        {lines.map((stage, index) => (
          <div className="row" key={stage.name}>
            <span>{index + 1}. {stage.name}</span>
            <MoneyAmount kobo={stage.kobo} usdc={stage.usdc} />
          </div>
        ))}
        <div className="row">
          <strong>Total to lock</strong>
          <strong data-total>
            <MoneyAmount kobo={kobo.toString()} usdc={usdc.toString()} />
          </strong>
        </div>
        <p className="muted">Total to lock: {nairaLabel} ({usdcLabel})</p>
      </div>
      {canLock ? (
        <button className={`ui-btn ${confirm ? "ui-btn-secondary" : "ui-btn-primary"} btn-block`} type="submit" disabled={pending}>
          {pending ? "Working…" : `Lock ${money.unit === "usdc" ? usdcLabel : nairaLabel} in escrow`}
        </button>
      ) : (
        <p className="muted">{NO_STAGES_TO_FUND}</p>
      )}
      {message ? <p className="toast" role="status">{message}</p> : null}
      <ConfirmDialog
        open={confirm}
        title="Lock money"
        body={`You're about to lock ${usdcLabel} (${nairaLabel}) for ${stageSpan}. Only approved stages can be paid from it. Continue?`}
        confirmLabel="Lock money"
        onConfirm={() => void onSubmit()}
        onClose={() => setConfirm(false)}
      />
    </form>
  );
}
