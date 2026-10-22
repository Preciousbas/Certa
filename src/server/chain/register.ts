import { getDatabase, projects } from "@certa/db";
import { eq } from "drizzle-orm";
import { audit } from "../audit.js";
import { registerJobHandler } from "../jobs/worker.js";
import { topUpIfLow } from "./flows.js";
import type { Hex } from "./port.js";
import { reconcileProject } from "./reconcile.js";
import { confirmTx } from "./tx.js";

export function registerChainJobs(): void {
  registerJobHandler("confirm_tx", async (payload) => {
    const chainTxId = payload.chainTxId;
    if (typeof chainTxId !== "string") return;
    await confirmTx(await getDatabase(), chainTxId);
  });
  registerJobHandler("reconcile_chain", async (payload) => {
    const projectId = payload.projectId;
    if (typeof projectId !== "string") return;
    await reconcileProject(await getDatabase(), projectId);
  });
  registerJobHandler("reconcile_open", async () => {
    const db = await getDatabase();
    const rows = await db.select().from(projects);
    for (const project of rows) {
      if (project.escrowAddress) await reconcileProject(db, project.id);
    }
  });
  registerJobHandler("gas_topup", async (payload) => {
    const address = payload.address;
    const projectId = payload.projectId;
    if (typeof address !== "string" || typeof projectId !== "string") return;
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return;
    await topUpIfLow(await getDatabase(), address as Hex, projectId);
  });
  registerJobHandler("submit_stage", async (payload) => {
    const projectId = payload.projectId;
    const stageId = payload.stageId;
    const submissionId = payload.submissionId;
    const evidenceHash = payload.evidenceHash;
    const stageIndex = payload.stageIndex;
    if (typeof projectId !== "string" || typeof stageId !== "string" || typeof submissionId !== "string") return;
    if (typeof evidenceHash !== "string" || !evidenceHash.startsWith("0x")) return;
    if (typeof stageIndex !== "number" || !Number.isInteger(stageIndex)) return;
    const db = await getDatabase();
    const { defaultSubmitStage } = await import("../verify/run.js");
    const sent = await defaultSubmitStage(db, {
      projectId,
      stageId,
      submissionId,
      evidenceHash: evidenceHash as `0x${string}`,
      stageIndex,
    });
    if (!sent.txHash) return;
    const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
    if (!project) return;
    await audit(db, {
      action: "stage_submitted_onchain",
      entity: "submissions",
      entityId: submissionId,
      projectId,
      workspaceId: project.workspaceId,
      actorKind: "system",
      after: { txHash: sent.txHash },
    });
  });
}
