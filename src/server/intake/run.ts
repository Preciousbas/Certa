import { registerIntakeJobs } from "./register.js";
import { drainJobs } from "../jobs/worker.js";

/** Parse queued spreadsheets, then extract. Inngest is not wired; this is what runs the jobs. */
export async function runDocumentJobs(): Promise<{ ran: number; dead: number }> {
  registerIntakeJobs();
  const parsed = await drainJobs(8, { kind: "parse_document", budgetMs: 20_000 });
  const extracted = await drainJobs(4, { kind: "extract_contract", budgetMs: 20_000 });
  return { ran: parsed.ran + extracted.ran, dead: parsed.dead + extracted.dead };
}
