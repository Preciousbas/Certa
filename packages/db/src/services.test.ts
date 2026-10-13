import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createMemoryDatabase } from "./client.js";
import { parties, projects, users, workspaceMembers, workspaces } from "./schema.js";
import { appendAudit, ensureWallet, issueJoinCode, recordPayment, redeemJoinCode, setActiveProject, visibleProjectIds } from "./services.js";
import { deemedAccepted, shouldEscalateChange, shouldNotifyConsultant } from "./timers.js";
import { fxRateFromNaira, nairaToKobo, usdcFromNgnKobo } from "@certa/shared";

async function fixture() {
  const opened = await createMemoryDatabase();
  const { db } = opened;
  const [client] = await db.insert(users).values({ telegramId: 10n, name: "Client" }).returning();
  const [ws] = await db
    .insert(workspaces)
    .values({ ownerUserId: client!.id, name: "Bassey", company: "Bassey Engineering Consult" })
    .returning();
  await db.insert(workspaceMembers).values({ workspaceId: ws!.id, userId: client!.id, role: "owner" });
  const rate = fxRateFromNaira(1500n);
  const [project] = await db
    .insert(projects)
    .values({
      workspaceId: ws!.id,
      name: "EM 22",
      siteLocation: "Lekki",
      siteLat: 6.45,
      siteLng: 3.47,
      geofenceRadiusM: 150,
      fxRateLocked: rate,
      fxSource: "locked",
      spendingCapUsdc: usdcFromNgnKobo(nairaToKobo(5_000_000n), rate),
      retentionBps: 500,
      defectsPeriodDays: 180,
      contractSumKobo: nairaToKobo(45_000_000n),
      contractSumUsdc: usdcFromNgnKobo(nairaToKobo(45_000_000n), rate),
    })
    .returning();
  const [otherClient] = await db.insert(users).values({ telegramId: 11n, name: "Other" }).returning();
  const [otherWs] = await db.insert(workspaces).values({ ownerUserId: otherClient!.id, name: "Other", company: "Other Ltd" }).returning();
  const [other] = await db
    .insert(projects)
    .values({
      workspaceId: otherWs!.id,
      name: "Other site",
      siteLocation: "Abuja",
      siteLat: 9.06,
      siteLng: 7.49,
      geofenceRadiusM: 100,
      fxRateLocked: rate,
      fxSource: "locked",
      spendingCapUsdc: 1n,
      retentionBps: 500,
      defectsPeriodDays: 30,
      contractSumKobo: 100n,
      contractSumUsdc: 1n,
    })
    .returning();
  return { ...opened, client: client!, ws: ws!, project: project!, other: other! };
}

describe("join codes and wallets", () => {
  it("rejects a bad code, rate-limits the sixth try, and creates one wallet", async () => {
    const { db, close, project, ws, client } = await fixture();
    const { code } = await issueJoinCode(db, { projectId: project.id, workspaceId: ws.id, role: "subcontractor", code: "ABCD2345" });
    for (let i = 0; i < 5; i++) {
      const result = await redeemJoinCode(db, { telegramId: 77n, name: "Danjuma", code: "ZZZZZZZZ" });
      expect(result.ok).toBe(false);
    }
    const blocked = await redeemJoinCode(db, { telegramId: 77n, name: "Danjuma", code });
    expect(blocked).toEqual({ ok: false, reason: "rate_limited" });

    const good = await redeemJoinCode(db, { telegramId: 88n, name: "Danjuma Concrete", code });
    expect(good.ok).toBe(true);
    if (!good.ok) throw new Error("expected join");
    let creates = 0;
    const wallet = await ensureWallet(db, good.partyId, async () => {
      creates += 1;
      return { address: "0xabc", walletId: "cdp-1", mock: true };
    });
    const again = await ensureWallet(db, good.partyId, async () => {
      creates += 1;
      return { address: "0xdef", walletId: "cdp-2", mock: true };
    });
    expect(creates).toBe(1);
    expect(again.address).toBe(wallet.address);
    const reused = await redeemJoinCode(db, { telegramId: 89n, name: "Second", code });
    expect(reused).toMatchObject({ ok: false, reason: "invalid" });

    const visible = await visibleProjectIds(db, client.id);
    expect(visible).toContain(project.id);
    expect(await setActiveProject(db, 10n, project.id, client.id)).toBe(true);
    const rows = await db.select().from(parties).where(eq(parties.id, good.partyId));
    expect(rows[0]?.walletAddress).toBe("0xabc");
    await close();
  });

  it("pays a stage once and chains the audit log", async () => {
    const { db, close, project, ws } = await fixture();
    const first = await recordPayment(db, {
      projectId: project.id,
      workspaceId: ws.id,
      kind: "stage",
      amountUsdc: 100n,
      amountNgnKobo: 150000n,
      idempotencyKey: "stage-1:1",
      status: "pending",
    });
    const second = await recordPayment(db, {
      projectId: project.id,
      workspaceId: ws.id,
      kind: "stage",
      amountUsdc: 100n,
      amountNgnKobo: 150000n,
      idempotencyKey: "stage-1:1",
      status: "confirmed",
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.payment.id).toBe(first.payment.id);
    const a = await appendAudit(db, { workspaceId: ws.id, action: "join", entity: "project", payload: "one" });
    const b = await appendAudit(db, { workspaceId: ws.id, action: "fund", entity: "project", payload: "two" });
    expect(b?.prevHash).toBe(a?.rowHash);
    await close();
  });
});

describe("timers", () => {
  it("escalates a silent change request after 72 hours and a dispute after 7 days", () => {
    const created = new Date("2026-10-01T00:00:00Z");
    expect(shouldEscalateChange({ createdAt: created, now: new Date("2026-10-03T23:00:00Z"), replyHours: 72, status: "pending" })).toBe(false);
    expect(shouldEscalateChange({ createdAt: created, now: new Date("2026-10-04T00:00:00Z"), replyHours: 72, status: "pending" })).toBe(true);
    expect(shouldEscalateChange({ createdAt: created, now: new Date("2026-10-05T00:00:00Z"), replyHours: 72, status: "accepted" })).toBe(false);
    const deadline = new Date("2026-10-08T00:00:00Z");
    expect(shouldNotifyConsultant({ deadlineAt: deadline, now: new Date("2026-10-07T00:00:00Z"), status: "open" })).toBe(false);
    expect(shouldNotifyConsultant({ deadlineAt: deadline, now: deadline, status: "open" })).toBe(true);
    expect(deemedAccepted({ allowed: true, escalated: true, consultantSilent: true })).toBe(true);
    expect(deemedAccepted({ allowed: false, escalated: true, consultantSilent: true })).toBe(false);
  });
});
