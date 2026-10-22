import { isTxHash } from "@certa/chain";
import { aiVerdicts, chainTxs, getDatabase, submissions, x402Spend } from "@certa/db";
import { usdcPlain } from "../../../../src/server/x402/gate";
import { desc, eq } from "drizzle-orm";
import { BASE_SEPOLIA_CHAIN_ID, explorerTx } from "../../lib/explorer";
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
  const verdicts = (await db.select().from(aiVerdicts).orderBy(desc(aiVerdicts.createdAt))).filter((row) =>
    data.stages.some((stage) => stage.id === row.stageId),
  );
  const latest = verdicts[0];
  const stage = latest
    ? data.stages.find((item) => item.id === latest.stageId)
    : data.stages.find((item) => item.id === notes[0]?.stageId);
  const calls = await db.select().from(x402Spend).where(eq(x402Spend.projectId, data.project.id));
  const feeTxs = await db.select().from(chainTxs).where(eq(chainTxs.projectId, data.project.id));
  const weather = calls.find((row) => row.endpoint.includes("weather"));
  const weatherTx = weather?.chainTxId ? feeTxs.find((row) => row.id === weather.chainTxId) : undefined;
  const label = latest?.verdict === "pass" ? "passed" : latest?.verdict === "fail" ? "needs work" : latest ? "needs more photos" : "";
  return (
    <div>
      <p className="eyebrow">Daily note</p>
      <h1>What the site showed today.</h1>
      <div className="card">
        <p>
          {latest && stage
            ? `${stage.name} ${label}. ${latest.reasons[0] ?? "The check is on the stage page."}`
            : "No submission is waiting."}
        </p>
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
    </div>
  );
}
