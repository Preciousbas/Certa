import { getDatabase, jobs } from "@certa/db";
import { and, eq, lte, sql } from "drizzle-orm";

const BACKOFF_MS = [30_000, 120_000, 600_000, 3_600_000, 21_600_000];

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(kind: string, handler: JobHandler): void {
  handlers.set(kind, handler);
}

export async function drainJobs(limit = 20): Promise<{ ran: number; dead: number }> {
  const started = Date.now();
  const db = await getDatabase();
  let ran = 0;
  let dead = 0;
  while (ran + dead < limit && Date.now() - started < 50_000) {
    const due = (
      await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.status, "queued"), lte(jobs.runAt, new Date())))
        .limit(1)
    )[0];
    if (!due) break;
    const claimed = await db
      .update(jobs)
      .set({ status: "running", updatedAt: new Date() })
      .where(and(eq(jobs.id, due.id), eq(jobs.status, "queued")))
      .returning();
    if (!claimed[0]) continue;
    const handler = handlers.get(due.kind);
    try {
      if (!handler) throw new Error(`No handler for ${due.kind}`);
      await handler(due.payload ?? {});
      await db
        .update(jobs)
        .set({ status: "succeeded", updatedAt: new Date() })
        .where(eq(jobs.id, due.id));
      ran += 1;
    } catch (error) {
      const attempts = due.attempts + 1;
      const delay = BACKOFF_MS[attempts - 1];
      const failed = delay === undefined;
      await db
        .update(jobs)
        .set({
          status: failed ? "dead" : "queued",
          attempts,
          runAt: failed ? due.runAt : new Date(Date.now() + delay),
          lastError: error instanceof Error ? error.message : "failed",
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, due.id));
      if (failed) dead += 1;
    }
  }
  return { ran, dead };
}

export async function queueCounts(): Promise<{ queued: number; dead: number }> {
  const db = await getDatabase();
  const rows = await db
    .select({ status: jobs.status, count: sql<number>`count(*)::int` })
    .from(jobs)
    .groupBy(jobs.status);
  const queued = rows.find((row) => row.status === "queued")?.count ?? 0;
  const dead = rows.find((row) => row.status === "dead")?.count ?? 0;
  return { queued, dead };
}
