import { basescanTx, isTxHash } from "@certa/chain";
import { getDatabase, submissions, x402Calls } from "@certa/db";
import { formatUsdc } from "@certa/shared";
import { desc, eq } from "drizzle-orm";
import { loadProject } from "../../lib/data";

export default async function ReportPage() {
  const data = await loadProject();
  if (!data) return <p>No project is open.</p>;
  const db = await getDatabase();
  const notes = await db
    .select()
    .from(submissions)
    .where(eq(submissions.projectId, data.project.id))
    .orderBy(desc(submissions.createdAt));
  const latest = notes.find((row) => row.confidence != null && row.evidenceHash !== "0xseed");
  const stage = latest ? data.stages.find((item) => item.id === latest.stageId) : undefined;
  const calls = await db.select().from(x402Calls).where(eq(x402Calls.projectId, data.project.id));
  const weather = calls.find((row) => row.endpoint.includes("weather") && isTxHash(row.txHash));
  return (
    <div>
      <p className="eyebrow">Daily note</p>
      <h1>What the site showed today.</h1>
      <div className="card">
        <p>
          {latest && stage
            ? `${stage.name} is in review at ${latest.confidence?.toFixed(2)} confidence.`
            : "No submission is waiting."}
        </p>
        <p>
          {weather && weather.txHash
            ? <>
                {weather.responseSummary ? <span>{weather.responseSummary} </span> : null}
                Agent paid {formatUsdc(weather.costUsdc)} for the weather check.{" "}
                <a href={basescanTx(weather.txHash)}>Receipt</a>
              </>
            : "No weather check has been paid."}
        </p>
      </div>
    </div>
  );
}
