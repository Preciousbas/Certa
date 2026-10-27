import { stageChip } from "../components/ui/status.js";

/** Plain stage status. A funded stage that has not started is "Locked, not started". */
export function stageStatusLabel(status: string, funded = false): string {
  if (funded && (status === "not_started" || status === "pending" || status === "funded")) return "Locked, not started";
  return stageChip(status).label;
}
