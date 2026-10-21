"use client";

import { useRef, useState, type FormEvent } from "react";
import { SEPOLIA_CHAIN_ID, explorerAddress, explorerLabel, explorerTx } from "../lib/explorer";
import { MoneyAmount, MoneyPair } from "./money";
import { useTelegramMainButton } from "./telegram";

type StageLine = { name: string; kobo: string; usdc: string };

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

export function FundForm({ projectId, defaultUpTo, stages, rateLabel }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<FundReceipt | null>(null);
  const [upTo, setUpTo] = useState(defaultUpTo);
  const [currency, setCurrency] = useState<"ngn" | "usdc">("ngn");
  const key = useRef<string | null>(null);
  const covered = stages.slice(0, upTo + 1);
  const kobo = covered.reduce((sum, stage) => sum + BigInt(stage.kobo), 0n).toString();
  const usdc = covered.reduce((sum, stage) => sum + BigInt(stage.usdc), 0n).toString();

  async function onSubmit(event?: FormEvent) {
    event?.preventDefault();
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setMessage("Open Certa in Telegram to lock this money.");
      return;
    }
    key.current ??= crypto.randomUUID();
    setPending(true);
    try {
      const response = await fetch("/api/mini/fund", {
        method: "POST",
        headers: { authorization: `tma ${initData}`, "content-type": "application/json" },
        body: JSON.stringify({ projectId, upToStage: upTo, idempotencyKey: key.current, currency }),
      });
      const body = (await response.json()) as Partial<FundReceipt> & { error?: string; message?: string };
      if (!response.ok || !body.amountNgnKobo || !body.amountUsdc || !body.stages) {
        setMessage(body.message ?? body.error ?? "Could not lock the money. Try again.");
        return;
      }
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
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
      setMessage("Could not lock the money. Try again.");
    } finally {
      setPending(false);
    }
  }

  useTelegramMainButton(currency === "ngn" ? "Pay in naira" : "Lock USDC", () => void onSubmit(), !receipt);

  if (receipt) {
    return (
      <section className="card confirm">
        <p className="eyebrow">{receipt.rail === "ngn" ? "Naira recorded" : "Locked"}</p>
        <MoneyPair kobo={receipt.amountNgnKobo} usdc={receipt.amountUsdc} suffix={receipt.rail === "ngn" ? " to pay" : " locked"} />
        <p className="muted">{receipt.stages.length} stages covered</p>
        <ul className="plain">
          {receipt.stages.map((stage) => (
            <li className="row" key={stage.name}>
              <span>{stage.name}</span>
              <MoneyAmount kobo={stage.amountNgnKobo} usdc={stage.amountUsdc} />
            </li>
          ))}
        </ul>
        {receipt.escrowAddress ? (
          <a href={explorerAddress(SEPOLIA_CHAIN_ID, receipt.escrowAddress)}>{explorerLabel(SEPOLIA_CHAIN_ID)}</a>
        ) : (
          <p className="muted">Escrow is not on chain yet.</p>
        )}
        <p>
          {receipt.rail === "ngn"
            ? "The naira amount is waiting. Escrow locks the matching USDC after that transfer clears."
            : receipt.status === "confirmed"
              ? "Locked. Proof is on the explorer."
              : "Locking. Waiting for the network."}
        </p>
        {receipt.txHash ? <a href={explorerTx(SEPOLIA_CHAIN_ID, receipt.txHash)}>Transaction</a> : null}
        <p>{receipt.contractorNotified ? "Contractor notified." : "Contractor not notified yet."}</p>
        {!receipt.created ? <p className="faint">This request was already sent.</p> : null}
        <a className="btn btn-block" href="/">
          Back to timeline
        </a>
        <button className="ghost btn-block" type="button" disabled>
          Download certificate
        </button>
        <p className="faint">The certificate is not ready.</p>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="eyebrow">Lock money</p>
      <h1>Fund the contract</h1>
      <p className="muted">Money stays locked, then pays out stage by stage. Naira follows the rate locked for this contract, {rateLabel} per USDC.</p>
      <div className="segmented" role="group" aria-label="What the client pays">
        <button type="button" data-active={currency === "ngn" ? "true" : "false"} onClick={() => setCurrency("ngn")}>
          Naira
        </button>
        <button type="button" data-active={currency === "usdc" ? "true" : "false"} onClick={() => setCurrency("usdc")}>
          USDC
        </button>
      </div>
      <div className="segmented" role="group" aria-label="How far to fund">
        <button type="button" data-active={upTo === stages.length - 1 ? "true" : "false"} onClick={() => setUpTo(stages.length - 1)}>
          Full
        </button>
        <button type="button" data-active={upTo === defaultUpTo ? "true" : "false"} onClick={() => setUpTo(defaultUpTo)}>
          Part-payment
        </button>
      </div>
      <p className="faint">Fund up to stage {upTo + 1}. {covered[covered.length - 1]?.name}</p>
      <div className="card">
        {covered.map((stage, index) => (
          <div className="row" key={stage.name}>
            <span>
              {index + 1}. {stage.name}
            </span>
            <MoneyAmount kobo={stage.kobo} usdc={stage.usdc} unit={currency} />
          </div>
        ))}
        <div className="row">
          <strong>{currency === "ngn" ? "Total to pay in naira" : "Total to lock"}</strong>
          <strong>
            <MoneyAmount kobo={kobo} usdc={usdc} unit={currency} />
          </strong>
        </div>
      </div>
      <button className="btn-block" type="submit" disabled={pending}>
        {pending ? "Sending" : currency === "ngn" ? "Pay in naira" : "Lock USDC"}
      </button>
      {message ? <p className="toast">{message}</p> : null}
    </form>
  );
}
