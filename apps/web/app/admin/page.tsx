import { getDatabase, payments } from "@certa/db";
import { eq } from "drizzle-orm";
import { AgentSpend } from "../../components/agent-spend";
import { loadProject } from "../../lib/data";
import { presentSpend, projectSpend } from "../../../../src/server/x402/report";

export default async function AdminPage() {
  const data = await loadProject();
  const db = await getDatabase();
  const paid = data ? await db.select().from(payments).where(eq(payments.projectId, data.project.id)) : [];
  const failed = paid.filter((row) => row.status === "failed").length;
  const spend = presentSpend(data ? await projectSpend(db, data.project.id) : { allowanceMicro: 0n, spentMicro: 0n, rows: [] });
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
    </div>
  );
}
