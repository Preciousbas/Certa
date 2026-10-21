import { createMemoryDatabase, documents, getDatabase, memberships, parties, projects, seedDemo, stages, users, workspaces, withRole } from "@certa/db";
import { eq } from "drizzle-orm";
import { fxRateFromNaira, nairaToKobo, usdcFromNgnKobo } from "@certa/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as fund } from "../../apps/web/app/api/mini/fund/route";
import { POST as review } from "../../apps/web/app/api/mini/review/route";
import { POST as capture } from "../../apps/web/app/api/mini/capture/route";
import { POST as changes } from "../../apps/web/app/api/mini/changes/route";
import { POST as dispute } from "../../apps/web/app/api/mini/dispute/route";
import { POST as release } from "../../apps/web/app/api/mini/release/route";
import { POST as plan } from "../../apps/web/app/api/mini/plan/route";
import { POST as nonce } from "../../apps/web/app/api/mini/nonce/route";
import { POST as admin } from "../../apps/web/app/api/mini/admin/route";
import { POST as cashout } from "../../apps/web/app/api/mini/cashout/route";
import { POST as docs } from "../../apps/web/app/api/mini/documents/route";
import { signInitData } from "../../src/server/auth/telegramInitData";

delete process.env.DATABASE_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.TELEGRAM_BOT_TOKEN = "123456:fake-bot-token";
process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars";
process.env.APP_URL = "http://localhost:3000";
process.env.DEMO_SEED = "true";

const handlers = [fund, review, capture, changes, dispute, release, plan, nonce, admin, cashout, docs];

function tma(telegramId: number) {
  const now = Math.floor(Date.now() / 1000);
  return signInitData(
    { auth_date: String(now), user: JSON.stringify({ id: telegramId, first_name: "Ada" }) },
    process.env.TELEGRAM_BOT_TOKEN ?? "",
  );
}

function call(handler: (request: Request) => Promise<Response>, projectId: string, telegramId: number) {
  return handler(
    new Request("http://localhost/api/mini/action", {
      method: "POST",
      headers: { authorization: `tma ${tma(telegramId)}`, "content-type": "application/json" },
      body: JSON.stringify({ projectId }),
    }),
  );
}

describe("tenant isolation", () => {
  let projectA = "";
  let projectB = "";
  let workspaceA = "";

  beforeAll(async () => {
    const db = await getDatabase();
    await seedDemo(db);
    const seeded = (await db.select().from(projects)).find((row) => row.termsHash === "seeded-terms");
    const contractor = (await db.select().from(users).where(eq(users.telegramId, 1003n)))[0];
    if (!seeded || !contractor) throw new Error("seed missing");
    projectA = seeded.id;
    workspaceA = seeded.workspaceId;
    const [other] = await db.insert(users).values({ telegramId: 8080n, name: "Other client" }).returning();
    const [ws] = await db.insert(workspaces).values({ ownerUserId: other!.id, name: "Other", company: "Other Ltd" }).returning();
    const rate = fxRateFromNaira(1500n);
    const [created] = await db
      .insert(projects)
      .values({
        workspaceId: ws!.id,
        name: "Project B",
        siteLocation: "Abuja",
        siteLat: 9,
        siteLng: 7,
        geofenceRadiusM: 50,
        fxRateLocked: rate,
        fxSource: "test",
        spendingCapUsdc: 1n,
        retentionBps: 500,
        defectsPeriodDays: 30,
        contractSumKobo: nairaToKobo(1n),
        contractSumUsdc: usdcFromNgnKobo(nairaToKobo(1n), rate),
      })
      .returning();
    if (!created) throw new Error("project B missing");
    projectB = created.id;
    await db.insert(memberships).values({ projectId: projectB, userId: other!.id, role: "client" });
  });

  it("rejects every project B endpoint for a contractor of project A", async () => {
    for (const handler of handlers) {
      const response = await call(handler, projectB, 1003);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: "forbidden",
        message: "You don't have permission to do this on this project.",
      });
    }
    expect(projectA).not.toBe(projectB);
  });

  it("stops a subcontractor reading an unassigned stage or any document", async () => {
    const db = await getDatabase();
    const [stage] = await db
      .insert(stages)
      .values({
        projectId: projectA,
        workspaceId: workspaceA,
        stageIndex: 90,
        name: "Unassigned",
        amountNgnKobo: 1n,
        amountUsdc: 1n,
        retentionBps: 0,
        onChainIdx: 90,
      })
      .returning();
    await db.insert(documents).values({
      projectId: projectA,
      workspaceId: workspaceA,
      kind: "contract",
      storageKey: "contracts/tenant-isolation",
      sha256: "a".repeat(64),
    });
    if (!stage) throw new Error("stage missing");
    const opened = await nonce(
      new Request("http://localhost/api/mini/nonce", {
        method: "POST",
        headers: { authorization: `tma ${tma(1004)}`, "content-type": "application/json" },
        body: JSON.stringify({ projectId: projectA, stageId: stage.id }),
      }),
    );
    expect(opened.status).toBe(403);
    const listed = await call(docs, projectA, 1004);
    expect(listed.status).toBe(403);
    const client = await call(docs, projectA, 1001);
    expect(client.status).toBe(200);
    const body = (await client.json()) as { documents: { id: string }[] };
    expect(body.documents.length).toBeGreaterThan(0);
  });
});

describe("row security for another project", () => {
  it("returns no project B rows to a contractor of A, and no documents to a subcontractor", async () => {
    const opened = await createMemoryDatabase();
    const { db } = opened;
    const [clientA] = await db.insert(users).values({ telegramId: 1n, name: "Client A" }).returning();
    const [contractor] = await db.insert(users).values({ telegramId: 2n, name: "Contractor" }).returning();
    const [sub] = await db.insert(users).values({ telegramId: 3n, name: "Sub" }).returning();
    if (!clientA || !contractor || !sub) throw new Error("users missing");
    const rate = fxRateFromNaira(1500n);
    const money = {
      siteLocation: "Site",
      siteLat: 6,
      siteLng: 3,
      geofenceRadiusM: 50,
      fxRateLocked: rate,
      fxSource: "test",
      spendingCapUsdc: 1n,
      retentionBps: 0,
      defectsPeriodDays: 30,
      contractSumKobo: nairaToKobo(1n),
      contractSumUsdc: usdcFromNgnKobo(nairaToKobo(1n), rate),
    };
    const [wsA] = await db.insert(workspaces).values({ ownerUserId: clientA.id, name: "A", company: "A Ltd" }).returning();
    const [wsB] = await db.insert(workspaces).values({ ownerUserId: clientA.id, name: "B", company: "B Ltd" }).returning();
    if (!wsA || !wsB) throw new Error("workspaces missing");
    const [projA] = await db.insert(projects).values({ ...money, workspaceId: wsA.id, name: "Project A" }).returning();
    const [projB] = await db.insert(projects).values({ ...money, workspaceId: wsB.id, name: "Project B" }).returning();
    if (!projA || !projB) throw new Error("projects missing");
    const [party] = await db
      .insert(parties)
      .values({ projectId: projA.id, workspaceId: wsA.id, userId: sub.id, role: "subcontractor" })
      .returning();
    if (!party) throw new Error("party missing");
    await db.insert(parties).values({ projectId: projA.id, workspaceId: wsA.id, userId: contractor.id, role: "main_contractor" });
    await db.insert(memberships).values([
      { projectId: projA.id, userId: contractor.id, role: "contractor" },
      { projectId: projA.id, userId: sub.id, role: "subcontractor" },
      { projectId: projA.id, userId: clientA.id, role: "client" },
    ]);
    await db.insert(stages).values([
      {
        projectId: projA.id,
        workspaceId: wsA.id,
        stageIndex: 0,
        name: "Assigned",
        amountNgnKobo: 1n,
        amountUsdc: 1n,
        retentionBps: 0,
        onChainIdx: 0,
        assignedPartyId: party.id,
      },
      {
        projectId: projA.id,
        workspaceId: wsA.id,
        stageIndex: 1,
        name: "Hidden",
        amountNgnKobo: 1n,
        amountUsdc: 1n,
        retentionBps: 0,
        onChainIdx: 1,
      },
      {
        projectId: projB.id,
        workspaceId: wsB.id,
        stageIndex: 0,
        name: "Other",
        amountNgnKobo: 1n,
        amountUsdc: 1n,
        retentionBps: 0,
        onChainIdx: 0,
      },
    ]);
    await db.insert(documents).values({
      projectId: projA.id,
      workspaceId: wsA.id,
      kind: "contract",
      storageKey: "contracts/rls",
      sha256: "b".repeat(64),
    });

    const foreign = await withRole(db, { userId: contractor.id }, (tx) =>
      tx.select().from(projects).where(eq(projects.id, projB.id)),
    );
    expect(foreign).toHaveLength(0);
    const foreignStages = await withRole(db, { userId: contractor.id }, (tx) =>
      tx.select().from(stages).where(eq(stages.projectId, projB.id)),
    );
    expect(foreignStages).toHaveLength(0);
    const subStages = await withRole(db, { userId: sub.id }, (tx) => tx.select().from(stages));
    expect(subStages.map((row) => row.name)).toEqual(["Assigned"]);
    const subDocs = await withRole(db, { userId: sub.id }, (tx) => tx.select().from(documents));
    expect(subDocs).toHaveLength(0);
    const clientDocs = await withRole(db, { userId: clientA.id }, (tx) => tx.select().from(documents));
    expect(clientDocs).toHaveLength(1);
    await opened.close();
  });
});
