import { readEscrowStages, readReleaseLogs } from "@certa/chain";
import { getDatabase, rememberEscrowSnapshot, type Database } from "@certa/db";
import { mirrorChainStages } from "../../../src/server/stages/transition";
import type { Hex } from "viem";

export async function syncEscrow(
  project: { id: string; workspaceId: string; escrowAddress: string | null },
  db?: Database,
) {
  const escrow = project.escrowAddress ?? "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(escrow)) return [];
  const database = db ?? (await getDatabase());
  const [statuses, releases] = await Promise.all([
    readEscrowStages(escrow as Hex),
    readReleaseLogs(escrow as Hex).catch(() => []),
  ]);
  await rememberEscrowSnapshot(database, project, statuses, releases);
  await mirrorChainStages(database, project.id, statuses);
  return statuses;
}
