import { registerJobHandler } from "../jobs/worker.js";

let registered = false;

export function registerVerifyJobs(): void {
  if (registered) return;
  registered = true;
  registerJobHandler("verify_stage", async (payload) => {
    const submissionId = typeof payload.submissionId === "string" ? payload.submissionId : "";
    if (!submissionId) return;
    const { getDatabase } = await import("@certa/db");
    const { runVerifyStage } = await import("./run.js");
    await runVerifyStage(await getDatabase(), submissionId);
  });
}
