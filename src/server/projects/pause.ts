import { projects, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { apiError } from "../../lib/validation/index.js";

export const PAUSED_MESSAGE = "This project is paused.";

export function rejectIfPaused(status: string): Response | null {
  if (status !== "paused") return null;
  return apiError(409, PAUSED_MESSAGE);
}

export async function setProjectPaused(db: Database, projectId: string, paused: boolean): Promise<void> {
  await db
    .update(projects)
    .set({ status: paused ? "paused" : "active", updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}
