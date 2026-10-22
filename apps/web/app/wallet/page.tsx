import { readUsdcBalance } from "@certa/chain";
import { formatUsdc } from "@certa/shared";
import { AccountAddress } from "../../components/account-address";
import { MoneyAmount } from "../../components/money";
import { SEPOLIA_CHAIN_ID, explorerAddress, explorerTx } from "../../lib/explorer";
import { loadProject } from "../../lib/data";

export default async function WalletPage() {
  const data = await loadProject();
  const mine = data?.parties.find((party) => party.userId === data.user.id && (party.role === "main_contractor" || party.role === "subcontractor" || party.role === "contractor"));
  const own = mine ?? data?.parties.find((party) => party.userId === data.user.id);
  const address = own?.walletAddress ?? null;
  const operator = (process.env.OPERATOR_WALLET_ADDRESS ?? "").toLowerCase();
  const valid = address && /^0x[a-fA-F0-9]{40}$/.test(address) && address.toLowerCase() !== operator ? address : null;
  let balance: string | null = null;
  if (valid) {
    try {
      balance = formatUsdc(await readUsdcBalance(valid as `0x${string}`));
    } catch {
      balance = null;
    }
  }
  const received = (data?.payments ?? []).filter((row) => row.txHash && /^0x[a-fA-F0-9]{64}$/.test(row.txHash));
  const held = (data?.stages ?? [])
    .filter((stage) => stage.status === "released")
    .reduce(
      (sum, stage) => ({
        kobo: sum.kobo + (stage.amountNgnKobo * BigInt(stage.retentionBps)) / 10000n,
        usdc: sum.usdc + (stage.amountUsdc * BigInt(stage.retentionBps)) / 10000n,
      }),
      { kobo: 0n, usdc: 0n },
    );
  return (
    <div>
      <p className="eyebrow">Payment account</p>
      <h1>{valid ? "Your payment account" : "Being created…"}</h1>
      <p className="muted">Payments for your work come to this account. You do not hold a seed phrase.</p>
      {valid ? <p className="money money-big">{balance ?? "Balance unavailable"}</p> : <p className="muted">No address is stored yet.</p>}
      <p>Retention held <MoneyAmount kobo={held.kobo.toString()} usdc={held.usdc.toString()} /></p>
      <h2>Payments received</h2>
      {received.length === 0 ? <p className="muted">No payment has been received yet.</p> : null}
      <ul className="plain">
        {received.map((row) => {
          const stage = data?.stages.find((item) => item.id === row.stageId);
          return (
            <li key={row.id}>
              {stage ? `${stage.stageIndex + 1}. ${stage.name}` : "Stage payment"}{" "}
              <MoneyAmount kobo={row.amountNgnKobo.toString()} usdc={row.amountUsdc.toString()} />{" "}
              {row.txHash ? <a href={explorerTx(SEPOLIA_CHAIN_ID, row.txHash)}>Proof ↗</a> : null}
            </li>
          );
        })}
      </ul>
      <article className="card">
        <h2>Cash out to bank — coming soon</h2>
        <p>We're adding naira bank withdrawals with a licensed partner.</p>
      </article>
      <details className="card">
        <summary>Show technical details</summary>
        <AccountAddress address={valid} />
        <p>Network: Ethereum Sepolia</p>
        {valid ? <p><a href={explorerAddress(SEPOLIA_CHAIN_ID, valid)}>View on Etherscan (Sepolia)</a></p> : null}
      </details>
    </div>
  );
}
