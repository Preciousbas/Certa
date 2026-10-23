import { getDatabase, payments } from "@certa/db";
import { eq } from "drizzle-orm";
import { AgentSpend } from "../../components/agent-spend";
import { loadProject } from "../../lib/data";
import { loadDiagnostics } from "../../../../src/server/admin/diagnostics";
import { presentSpend, projectSpend } from "../../../../src/server/x402/report";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const data = await loadProject();
  const db = await getDatabase();
  const paid = data ? await db.select().from(payments).where(eq(payments.projectId, data.project.id)) : [];
  const failed = paid.filter((row) => row.status === "failed").length;
  const spend = presentSpend(data ? await projectSpend(db, data.project.id) : { allowanceMicro: 0n, spentMicro: 0n, rows: [] });
  const diagnostics = await loadDiagnostics();
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
          <span>Failed releases</span>
          <span>{failed}</span>
        </div>
      </div>
      <AgentSpend heading={spend.heading} rows={spend.rows} />
      <p className="eyebrow">Diagnostics</p>
      <h2>What the service can reach.</h2>
      <div className="card">
        <div className="row">
          <span>Database</span>
          <span>{diagnostics.database}</span>
        </div>
        <div className="row">
          <span>Ethereum Sepolia</span>
          <span>{diagnostics.ethereumSepolia}</span>
        </div>
        <div className="row">
          <span>Base Sepolia</span>
          <span>{diagnostics.baseSepolia}</span>
        </div>
        <div className="row">
          <span>Escrow factory</span>
          <span>{diagnostics.escrowFactory}</span>
        </div>
        <div className="row">
          <span>CDP</span>
          <span>{diagnostics.cdp}</span>
        </div>
        <div className="row">
          <span>X402 pay-to guard</span>
          <span>{diagnostics.x402PayTo}</span>
        </div>
        <div className="row">
          <span>Last worker run</span>
          <span>{diagnostics.lastWorkerRun}</span>
        </div>
        <div className="row">
          <span>Version</span>
          <span>{diagnostics.version}</span>
        </div>
      </div>
      <div className="card">
        <p className="eyebrow">Recent errors</p>
        {diagnostics.recentErrors.length === 0 ? (
          <p>None stored.</p>
        ) : (
          <ul className="plain">
            {diagnostics.recentErrors.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
