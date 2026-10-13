import { loadProject } from "../../lib/data";

export default async function AdminPage() {
  const data = await loadProject();
  return (
    <div>
      <p className="eyebrow">Desk</p>
      <h1>What failed, and what the agent spent.</h1>
      <div className="card">
        <div className="row"><span>Open changes</span><span>{data?.changes.filter((row) => row.status === "pending").length ?? 0}</span></div>
        <div className="row"><span>Disputes</span><span>{data?.disputes.length ?? 0}</span></div>
        <div className="row"><span>x402 allowance</span><span>2.00 USDC</span></div>
        <div className="row"><span>Failed releases</span><span>0</span></div>
      </div>
    </div>
  );
}
