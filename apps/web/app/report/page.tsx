import { isTxHash } from "@certa/chain";
import { aiVerdicts, chainTxs, disputes, getDatabase, x402Spend } from "@certa/db";
import { formatNaira } from "../../../../src/lib/money/kobo";
import { usdcPlain } from "../../../../src/server/x402/gate";
import { desc, eq } from "drizzle-orm";
import { ReportRange } from "../../components/report-range";
import { BASE_SEPOLIA_CHAIN_ID, explorerTx } from "../../lib/explorer";
import { loadProject } from "../../lib/data";
import { noConsultantDispute } from "../../../../src/server/projects/approvalMode";

function sentence(label: "Today" | "This week", rows: { verdict: string }[], released: string, next: string): string {
  const pass = rows.filter((row) => row.verdict === "pass").length;
  const fail = rows.filter((row) => row.verdict === "fail").length;
  const unsure = rows.length - pass - fail;
  return `${label}: ${rows.length} photo sets checked (${pass} passed, ${fail} need work, ${unsure} need more photos); ${released} paid out; next stage due: ${next}.`;
}

export default async function ReportPage() {
  const data = await loadProject();
  if (!data) return <p>No project is open.</p>;
  const db = await getDatabase();
  const verdicts = (await db.select().from(aiVerdicts).orderBy(desc(aiVerdicts.createdAt))).filter((row) =>
    data.stages.some((stage) => stage.id === row.stageId),
  );
  const now = Date.now();
  const day = verdicts.filter((row) => now - row.createdAt.getTime() < 86_400_000);
  const week = verdicts.filter((row) => now - row.createdAt.getTime() < 7 * 86_400_000);
  const releasedKobo = data.stages.filter((stage) => stage.status === "released").reduce((sum, stage) => sum + stage.amountNgnKobo, 0n);
  const released = formatNaira(releasedKobo);
  const next = data.stages.find((stage) => stage.status !== "released")?.name ?? "none";
  const calls = await db.select().from(x402Spend).where(eq(x402Spend.projectId, data.project.id));
  const feeTxs = await db.select().from(chainTxs).where(eq(chainTxs.projectId, data.project.id));
  const weather = calls.find((row) => row.endpoint.includes("weather"));
  const weatherTx = weather?.chainTxId ? feeTxs.find((row) => row.id === weather.chainTxId) : undefined;
  const certificates = data.stages.filter((stage) => stage.status === "released");
  const openDisputes = (await db.select().from(disputes).where(eq(disputes.projectId, data.project.id))).filter((row) => row.status === "open" && noConsultantDispute(row.resolution));
  const disputed = data.stages.filter((stage) => openDisputes.some((row) => row.stageId === stage.id));
  return (
    <div>
      <p className="eyebrow">Reports</p>
      <h1>{data.project.name}</h1>
      <div className="card">
        <ReportRange daily={sentence("Today", day, released, next)} weekly={sentence("This week", week, released, next)} />
        <p>
          {weather && weatherTx && isTxHash(weatherTx.txHash) ? (
            <>
              <span>{weather.resultSummary} </span>
              Agent paid {usdcPlain(weather.amountMicro)} USDC for the weather check.{" "}
              <a href={explorerTx(BASE_SEPOLIA_CHAIN_ID, weatherTx.txHash)}>Proof ↗</a>
            </>
          ) : (
            "No weather check has been paid."
          )}
        </p>
      </div>
      {disputed.length > 0 ? (
        <ul>
          {disputed.map((stage) => (
            <li key={stage.id}>{stage.stageIndex + 1}. {stage.name} — Disputed: no independent reviewer</li>
          ))}
        </ul>
      ) : null}
      <h2>Certificates</h2>
      {certificates.length === 0 ? <p className="muted">No payment certificate yet.</p> : null}
      <ul>
        {certificates.map((stage) => (
          <li key={stage.id}>
            <a href={`/api/projects/${data.project.id}/stages/${stage.stageIndex + 1}/certificate`}>
              {stage.stageIndex + 1}. {stage.name}
            </a>
          </li>
        ))}
      </ul>
      <p>
        <a className="ui-btn ui-btn-primary" href={`/api/projects/${data.project.id}/report`}>Export report PDF</a>
      </p>
    </div>
  );
}
