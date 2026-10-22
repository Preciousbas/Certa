import { parseDocumentJob, extractDocumentJob } from "./flow.js";
import { registerJobHandler } from "../jobs/worker.js";

let registered = false;

export function registerIntakeJobs(): void {
  if (registered) return;
  registered = true;
  registerJobHandler("parse_document", async (payload) => {
    const documentId = typeof payload.documentId === "string" ? payload.documentId : "";
    if (!documentId) return;
    const { getDatabase } = await import("@certa/db");
    await parseDocumentJob(await getDatabase(), documentId);
  });
  registerJobHandler("extract_contract", async (payload) => {
    const projectId = typeof payload.projectId === "string" ? payload.projectId : "";
    if (!projectId) return;
    const { getDatabase } = await import("@certa/db");
    await extractDocumentJob(await getDatabase(), projectId);
  });
  registerJobHandler("contract_reply", async (payload) => {
    const projectId = typeof payload.projectId === "string" ? payload.projectId : "";
    const versionId = typeof payload.versionId === "string" ? payload.versionId : "";
    const hoursLeft = typeof payload.hoursLeft === "number" ? payload.hoursLeft : 0;
    if (!projectId || !versionId) return;
    const { getDatabase } = await import("@certa/db");
    const { deliverContractReply } = await import("./notify.js");
    await deliverContractReply(await getDatabase(), { projectId, versionId, hoursLeft });
  });
  // TODO(prompt-40): the chain call is intentionally deferred. acceptTerms() takes no content hash and runs only after the escrow exists.
  registerJobHandler("accept_terms_deferred", () => Promise.resolve());
}
