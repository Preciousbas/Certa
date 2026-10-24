import { getDatabase, jobs, telegramUpdates } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { enqueueJob } from "./enqueue.js";
import { setTelegramUpdateDispatch } from "./telegramUpdate.js";
import { drainJobs, STALE_TELEGRAM_UPDATE } from "./worker.js";

delete process.env.DATABASE_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

describe("telegram.update job", () => {
  it("handles a queued update exactly once", async () => {
    const seen: number[] = [];
    setTelegramUpdateDispatch(async (update) => {
      seen.push(update.update_id);
    });
    const db = await getDatabase();
    await db.insert(telegramUpdates).values({ updateId: 42n }).onConflictDoNothing();
    await enqueueJob(db, {
      kind: "telegram.update",
      dedupeKey: "telegram.update:42",
      payload: { update_id: 42 },
    });
    await enqueueJob(db, {
      kind: "telegram.update",
      dedupeKey: "telegram.update:42",
      payload: { update_id: 42 },
    });
    await drainJobs(10);
    await db.update(jobs).set({ status: "queued", runAt: new Date() }).where(eq(jobs.dedupeKey, "telegram.update:42"));
    await drainJobs(10);
    const queued = await db.select().from(jobs).where(eq(jobs.dedupeKey, "telegram.update:42"));
    expect(queued).toHaveLength(1);
    expect(seen).toEqual([42]);
  });

  it("skips a telegram.update older than 10 minutes instead of replaying it", async () => {
    const seen: number[] = [];
    setTelegramUpdateDispatch(async (update) => {
      seen.push(update.update_id);
    });
    const db = await getDatabase();
    await db.insert(telegramUpdates).values({ updateId: 77n }).onConflictDoNothing();
    await enqueueJob(db, {
      kind: "telegram.update",
      dedupeKey: "telegram.update:77",
      payload: { update_id: 77 },
    });
    await db.update(jobs).set({ createdAt: new Date(Date.now() - 11 * 60 * 1000) }).where(eq(jobs.dedupeKey, "telegram.update:77"));
    await drainJobs(5);
    const row = (await db.select().from(jobs).where(eq(jobs.dedupeKey, "telegram.update:77")))[0];
    expect(row?.status).toBe("skipped");
    expect(row?.lastError).toBe(STALE_TELEGRAM_UPDATE);
    expect(seen).not.toContain(77);
  });
});
