import type { EscrowSnapshot } from "@certa/chain";
import { projects, stages, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { audit } from "../audit.js";
import { defaultPort, type ChainPort, type Hex } from "./port.js";

const CHAIN_STATUS = ["pending", "funded", "submitted", "released", "disputed", "cancelled"] as const;

function moneyStatus(status: string): string {
  if (status === "released" || status === "disputed" || status === "cancelled") return status;
  if (status === "not_started" || status === "pending") return "pending";
  return "open";
}

export async function reconcileProject(db: Database, projectId: string, port: ChainPort = defaultPort(), snapshot?: EscrowSnapshot) {
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
  if (!project?.escrowAddress || !/^0x[a-fA-F0-9]{40}$/.test(project.escrowAddress)) return { mismatches: 0 };
  const chain = snapshot ?? (await port.escrowSnapshot(project.escrowAddress as Hex));
  const rows = await db.select().from(stages).where(eq(stages.projectId, projectId));
  const mismatches: string[] = [];
  if (chain.tokenBalance !== chain.totalFunded - chain.totalOut) {
    mismatches.push("escrow balance does not match funded minus released and refunded");
  }
  for (const stage of rows) {
    const onChain = chain.stages.find((item) => item.index === stage.onChainIdx);
    if (!onChain) continue;
    const chainName = CHAIN_STATUS[onChain.status] ?? "unknown";
    const fundedOnChain = chainName !== "pending" && chainName !== "cancelled";
    if (stage.status === "released" && chainName !== "released") mismatches.push(`stage ${stage.onChainIdx} is released in the database and ${chainName} on chain`);
    if (stage.funded && chainName === "pending") mismatches.push(`stage ${stage.onChainIdx} is marked funded in the database and pending on chain`);
    if (fundedOnChain && !stage.funded && moneyStatus(stage.status) !== "released") {
      await db.update(stages).set({ funded: true }).where(eq(stages.id, stage.id));
    }
  }
  await db.update(projects).set({ chainSync: mismatches.length ? "updating" : "ok" }).where(eq(projects.id, projectId));
  if (mismatches.length) {
    await audit(db, {
      action: "reconciliation_mismatch",
      entity: "projects",
      entityId: projectId,
      projectId,
      workspaceId: project.workspaceId,
      actorKind: "system",
      reason: mismatches.join("; "),
      after: { mismatches },
    });
  }
  return { mismatches: mismatches.length };
}
