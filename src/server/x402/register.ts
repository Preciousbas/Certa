import { getDatabase } from "@certa/db";
import { registerJobHandler } from "../jobs/worker.js";
import { runPrePourCheck } from "./prepour.js";

function textField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function appOrigin(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
}

export function registerX402Jobs(): void {
  registerJobHandler("pre_pour_check", async (payload) => {
    const projectId = textField(payload.projectId);
    const stageId = textField(payload.stageId);
    if (!projectId || !stageId) return;
    const db = await getDatabase();
    const result = await runPrePourCheck(db, { projectId, stageId, origin: appOrigin() });
    if (result === "failed") return;
  });
}
