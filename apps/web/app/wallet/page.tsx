import { readUsdcBalance } from "@certa/chain";
import { formatUsdc } from "@certa/shared";
import { AccountAddress } from "../../components/account-address";
import { loadProject } from "../../lib/data";

export default async function WalletPage() {
  const data = await loadProject();
  const mine = data?.parties.find((party) => party.userId === data.user.id);
  const address = mine?.walletAddress ?? null;
  const valid = address && /^0x[a-fA-F0-9]{40}$/.test(address) ? address : null;
  let balance: string | null = null;
  let balanceNote = "Ethereum Sepolia did not answer.";
  if (valid) {
    try {
      balance = formatUsdc(await readUsdcBalance(valid as `0x${string}`));
      balanceNote = "USDC on Ethereum Sepolia.";
    } catch {
      balance = null;
    }
  }
  return (
    <div>
      <p className="eyebrow">Payment account</p>
      <h1>{address ? "Your payment account is ready." : "Being created…"}</h1>
      <p className="muted">The address stays under Advanced. You do not hold a seed phrase.</p>
      {valid ? (
        <p className="money money-big">{balance ?? "Balance unavailable"}</p>
      ) : null}
      <p className="faint">{valid ? balanceNote : "No address is stored yet."}</p>
      <details className="card" open>
        <summary>Advanced</summary>
        <AccountAddress address={address} />
        {address && !mine?.walletMock ? <p className="faint">This address is the server account.</p> : null}
      </details>
    </div>
  );
}
