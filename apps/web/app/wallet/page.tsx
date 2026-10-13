import { loadProject } from "../../lib/data";

export default async function WalletPage() {
  const data = await loadProject();
  const sub = data?.parties.find((party) => party.role === "subcontractor");
  return (
    <div>
      <p className="eyebrow">Payment account</p>
      <h1>Your payment account is ready.</h1>
      <p className="muted">The address stays under Advanced. You do not hold a seed phrase.</p>
      <details className="card">
        <summary>Advanced</summary>
        <p>{sub?.walletAddress ?? "Not created yet."}</p>
        <p className="faint">{sub?.walletMock ? "Demo account, not a live CDP wallet." : "CDP server wallet."}</p>
      </details>
    </div>
  );
}
