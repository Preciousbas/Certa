import { createMemoryDatabase, jobs, payments, projects, users, workspaces, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enqueueReleaseRetry, runReleaseRetry, type ReleaseCall } from "./releaseRetry.js";

let db: Database;
let close: () => Promise<void>;
let projectId = "";
let workspaceId = "";

beforeAll(async () => {
  const opened = await createMemoryDatabase();
  db = opened.db;
  close = opened.close;
  const [user] = await db.insert(users).values({ telegramId: 8201n, name: "Ada Client" }).returning();
  if (!user) throw new Error("user");
  const [workspace] = await db.insert(workspaces).values({ ownerUserId: user.id, name: "Ada", company: "Ada Ltd" }).returning();
  if (!workspace) throw new Error("workspace");
  workspaceId = workspace.id;
  const [project] = await db
    .insert(projects)
    .values({
      workspaceId: workspace.id,
      name: "Plot 14 Lekki",
      siteLocation: "Lekki",
      siteLat: 6.4,
      siteLng: 3.4,
      geofenceRadiusM: 150,
      fxRateLocked: 133111n,
      fxSource: "test",
      spendingCapUsdc: 1_000_000n,
      retentionBps: 500,
      defectsPeriodDays: 180,
      contractSumKobo: 550_000n,
      contractSumUsdc: 4_000_000n,
    })
    .returning();
  if (!project) throw new Error("project");
  projectId = project.id;
});

afterAll(async () => {
  await close();
});

const call: ReleaseCall = {
  projectId: "",
  stageId: "22222222-2222-2222-2222-222222222222",
  approvalId: "33333333-3333-3333-3333-333333333333",
  stageIndex: 1,
  amountMicro: 400_000n,
  capMicro: 1_000_000n,
};

describe("release retry", () => {
  it("enqueues one job and releases once for the same idempotency key", async () => {
    const idempotencyKey = "bot-approve:stage-retry";
    await db.insert(payments).values({
      projectId,
      workspaceId,
      kind: "release",
      amountUsdc: 400_000n,
      amountNgnKobo: 50_000n,
      status: "failed",
      idempotencyKey,
    });
    await enqueueReleaseRetry(db, { ...call, projectId, idempotencyKey });
    await enqueueReleaseRetry(db, { ...call, projectId, idempotencyKey });
    const queued = await db.select().from(jobs).where(eq(jobs.dedupeKey, idempotencyKey));
    expect(queued).toHaveLength(1);
    let calls = 0;
    const release = async () => {
      calls += 1;
      return { ok: true as const, explorerLink: "https://sepolia.etherscan.io/tx/0xabc" };
    };
    expect(await runReleaseRetry(db, queued[0]?.payload ?? {}, release)).toBe("released");
    expect(await runReleaseRetry(db, queued[0]?.payload ?? {}, release)).toBe("skipped");
    expect(calls).toBe(1);
    const payment = (await db.select().from(payments).where(eq(payments.idempotencyKey, idempotencyKey)))[0];
    expect(payment?.status).toBe("confirmed");
  });
});
