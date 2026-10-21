import { isTxHash } from "@certa/chain";
import { BASE_SEPOLIA_CHAIN_ID, explorerTx } from "../../lib/explorer";
import { getDatabase, payments, workspaces, x402Calls } from "@certa/db";
import { formatUsdc } from "@certa/shared";
import { allowanceLeft } from "../../lib/x402";
import { eq } from "drizzle-orm";
import { loadProject } from "../../lib/data";

export default async function AdminPage() {
  const data = await loadProject();
  const db = await getDatabase();
  const calls = data ? await db.select().from(x402Calls).where(eq(x402Calls.projectId, data.project.id)) : [];
  const paid = data ? await db.select().from(payments).where(eq(payments.projectId, data.project.id)) : [];
  const workspace = data ? (await db.select().from(workspaces).where(eq(workspaces.id, data.project.workspaceId)))[0] : undefined;
  const failed = paid.filter((row) => row.status === "failed").length;
  const spend = calls.reduce((sum, row) => sum + row.costUsdc, 0n);
  return (
    <div>
      <p className="eyebrow">Desk</p>
      <h1>What failed, and what the agent spent.</h1>
      <div className="card">
        <div className="row">
          <span>Open changes</span>
          <span>{data?.changes.filter((row) => row.status === "pending").length ?? 0}</span>
        </div>
        <div className="row">
          <span>Disputes</span>
          <span>{data?.disputes.length ?? 0}</span>
        </div>
        <div className="row">
          <span>Agent spend</span>
          <span>{calls.length === 0 ? "No agent spend recorded." : formatUsdc(spend)}</span>
        </div>
        <div className="row">
          <span>Allowance left</span>
          <span>{workspace ? formatUsdc(allowanceLeft(workspace.x402AllowanceUsdc, spend)) : "No allowance is stored."}</span>
        </div>
        {calls.map((row) => isTxHash(row.txHash) ? (
          <div className="row" key={row.id}>
            <span>Receipt</span>
            <a href={explorerTx(BASE_SEPOLIA_CHAIN_ID, row.txHash)}>{formatUsdc(row.costUsdc)}</a>
          </div>
        ) : null)}
        <div className="row">
          <span>Failed releases</span>
          <span>{failed}</span>
        </div>
      </div>
    </div>
  );
}
