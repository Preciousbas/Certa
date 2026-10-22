import { jobs, type Database } from "@certa/db";
import { eq } from "drizzle-orm";

export async function enqueueJob(
  db: Database,
  input: { kind: string; payload?: Record<string, unknown>; dedupeKey?: string; runAt?: Date },
) {
  const inserted = await db
    .insert(jobs)
    .values({
      kind: input.kind,
      payload: input.payload ?? {},
      dedupeKey: input.dedupeKey,
      runAt: input.runAt ?? new Date(),
    })
    .onConflictDoNothing({ target: jobs.dedupeKey })
    .returning();
  if (inserted[0]) return inserted[0];
  if (!input.dedupeKey) throw new Error("The job was not queued.");
  const existing = (await db.select().from(jobs).where(eq(jobs.dedupeKey, input.dedupeKey)))[0];
  if (!existing) throw new Error("The job was not queued.");
  return existing;
}
