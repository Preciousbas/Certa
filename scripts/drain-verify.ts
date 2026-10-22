import { getDatabase } from "@certa/db";
import { enqueueJob } from "../src/server/jobs/enqueue.js";
import { drainJobs, registerJobHandler } from "../src/server/jobs/worker.js";
import { PROMPT_VERSION } from "../src/server/ai/prompts/stage_verify.v3.js";
import { runVerifyStage } from "../src/server/verify/run.js";

const BUDGET_MS = 15 * 60 * 1000;
const CRON_URL = "https://certa-two.vercel.app/api/cron/jobs";

let needsCron = false;

registerJobHandler("verify_stage", async (payload) => {
  const submissionId = typeof payload.submissionId === "string" ? payload.submissionId : "";
  if (!submissionId) return;
  const db = await getDatabase();
  await runVerifyStage(db, submissionId, {
    promptVersion: PROMPT_VERSION,
    submit: async (database, input) => {
      await enqueueJob(database, {
        kind: "submit_stage",
        payload: {
          projectId: input.projectId,
          stageId: input.stageId,
          submissionId: input.submissionId,
          evidenceHash: input.evidenceHash,
          stageIndex: input.stageIndex,
        },
        dedupeKey: `submit_stage:${input.submissionId}`,
      });
      needsCron = true;
      return { txHash: null };
    },
  });
});

async function kickCron(): Promise<void> {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) throw new Error("CRON_SECRET is not set.");
  const response = await fetch(CRON_URL, {
    headers: { "x-cron-secret": secret },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`The chain cron returned ${response.status}.`);
}

export async function drainVerify(): Promise<number> {
  const result = await drainJobs(20, { kind: "verify_stage", budgetMs: BUDGET_MS });
  if (needsCron) await kickCron();
  return result.ran;
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("drain-verify.ts") || entry.endsWith("drain-verify.js")) {
  drainVerify()
    .then((ran) => {
      process.stdout.write(`verify jobs ${ran}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : "drain failed"}\n`);
      process.exit(1);
    });
}
