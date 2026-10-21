import { readEscrowStages, readReleaseLogs } from "@certa/chain";
import { rememberEscrowSnapshot, type Database } from "@certa/db";
import { mirrorChainStages } from "../../../src/server/stages/transition";

function asAddress(value: string): `0x${string}` | null {
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? (value as `0x${string}`) : null;
}

export async function syncEscrowProject(
  db: Database,
  project: { id: string; workspaceId: string; escrowAddress: string | null },
) {
  const escrow = asAddress(project.escrowAddress ?? "");
  if (!escrow) return;
  const [statuses, releases] = await Promise.all([
    readEscrowStages(escrow),
    readReleaseLogs(escrow).catch(() => []),
  ]);
  await rememberEscrowSnapshot(db, project, statuses, releases);
  await mirrorChainStages(db, project.id, statuses);
}
