import { createMemoryDatabase, jobs, memberships, notifications, projects, stages, users, workspaces, x402Spend, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paymentChallenge } from "../../../apps/web/lib/x402.js";
import { GET as materialsPrice } from "../../../apps/web/app/api/paid/materials-price/route.js";
import { bWx1, bWx2, bWx3 } from "../../bot/messages.js";
import { forecastFromOpenMeteo, precipMmNext24h } from "./forecast.js";
import { canPay, maxPerCallMicro, paidAccountDenial, prePourDedupeKey, remainingAllowance, stageNeedsWeather, usdcPlain } from "./gate.js";
import { enqueuePrePour, runPrePourCheck } from "./prepour.js";
import type { PaidSuccess } from "./agent.js";

let db: Database;
let close: () => Promise<void>;
let projectId = "";
let workspaceId = "";
let stageId = "";
let contractorId = "";
let consultantId = "";

beforeAll(async () => {
  const opened = await createMemoryDatabase();
  db = opened.db;
  close = opened.close;
  const [contractor] = await db.insert(users).values({ telegramId: 9101n, name: "Contractor" }).returning();
  const [consultant] = await db.insert(users).values({ telegramId: 9102n, name: "Consultant" }).returning();
  if (!contractor || !consultant) throw new Error("users");
  contractorId = contractor.id;
  consultantId = consultant.id;
  const [workspace] = await db
    .insert(workspaces)
    .values({ ownerUserId: contractor.id, name: "Site", company: "Site Ltd", allowanceMicro: 0n })
    .returning();
  if (!workspace) throw new Error("workspace");
  workspaceId = workspace.id;
  const [project] = await db
    .insert(projects)
    .values({
      workspaceId,
      name: "Lekki slab",
      siteLocation: "Lekki",
      siteLat: 6.4474,
      siteLng: 3.4723,
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
  const [stage] = await db
    .insert(stages)
    .values({
      projectId,
      workspaceId,
      stageIndex: 1,
      name: "Foundation concrete",
      amountNgnKobo: 100_000n,
      amountUsdc: 10_000n,
      retentionBps: 500,
      onChainIdx: 1,
      tags: ["concrete_pour"],
    })
    .returning();
  if (!stage) throw new Error("stage");
  stageId = stage.id;
  await db.insert(memberships).values([
    { projectId, userId: contractorId, role: "contractor" },
    { projectId, userId: consultantId, role: "consultant" },
  ]);
});

afterAll(async () => {
  await close();
});

function paid(rain: boolean): PaidSuccess {
  return {
    ok: true,
    amountMicro: 10_000n,
    usdc: "0.01",
    txHash: `0x${"ab".repeat(32)}`,
    network: "eip155:84532",
    proofUrl: "https://sepolia.basescan.org/tx/0x",
    rainExpected: rain,
    pct: rain ? 72 : 18,
    mm: rain ? "4.5" : "0",
    summary: rain ? "Rain likely" : "Good to pour",
  };
}

describe("x402 allowance and weather", () => {
  it("prices a weather challenge on Base Sepolia and refuses an over-limit or empty allowance", async () => {
    const challenge = paymentChallenge("0xabc");
    expect(challenge.status).toBe(402);
    const body = (await challenge.json()) as { accepts: { network: string; amount: string }[] };
    expect(body.accepts[0]?.network).toBe("eip155:84532");
    expect(body.accepts[0]?.amount).toBe("10000");
    expect(remainingAllowance({ allowanceMicro: 100_000n, spentMicro: 30_000n, gasMicro: 20_000n })).toBe(50_000n);
    expect(remainingAllowance({ allowanceMicro: 10_000n, spentMicro: 10_000n, gasMicro: 0n })).toBe(0n);
    expect(canPay({ priceMicro: 10_000n, allowanceLeft: 10_000n, maxPerCall: 50_000n }).ok).toBe(true);
    expect(canPay({ priceMicro: 60_000n, allowanceLeft: 1_000_000n, maxPerCall: 50_000n })).toEqual({
      ok: false,
      reason: "that check costs more than the per-call limit",
    });
    expect(canPay({ priceMicro: 10_000n, allowanceLeft: 9_000n, maxPerCall: 50_000n })).toEqual({
      ok: false,
      reason: "the monthly allowance is used up",
    });
    expect(usdcPlain(10_000n)).toBe("0.01");
    expect(stageNeedsWeather({ tags: ["concrete_pour"], pour: false })).toBe(true);
    expect(stageNeedsWeather({ tags: ["roofing"], pour: false })).toBe(true);
    expect(stageNeedsWeather({ tags: ["painting"], pour: false })).toBe(false);
  });

  it("reads an Open-Meteo forecast and marks rain at the threshold", () => {
    const forecast = forecastFromOpenMeteo(
      {
        hourly: {
          time: ["2026-10-22T10:00", "2026-10-22T11:00"],
          precipitation_probability: [70, 20],
          precipitation: [1.2, 0.3],
          temperature_2m: [27.1, 28],
          wind_speed_10m: [12, 14],
        },
      },
      { lat: 6.4474, lng: 3.4723 },
      "2026-10-22T09:00:00.000Z",
      60,
    );
    expect(forecast?.summary).toEqual({ max_precip_prob_pct_next_24h: 70, rain_expected: true });
    expect(forecast?.hours[0]?.precip_mm).toBe(1.2);
    expect(precipMmNext24h(forecast!)).toBe(1.5);
    expect(forecastFromOpenMeteo({ hourly: { time: [] } }, { lat: 1, lng: 1 })).toBeNull();
  });

  it("returns 503 when the pay-to address equals the client address", () => {
    const treasury = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const client = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(paidAccountDenial(treasury, client)).toEqual({
      error: "The payment account matches the client address. Weather fees must go to the Certa treasury.",
      status: 503,
    });
    expect(paidAccountDenial(treasury, "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")).toBeNull();
  });

  it("returns materials as unavailable and does not ask for payment", async () => {
    const response = materialsPrice();
    expect(response.status).toBe(503);
    expect(response.headers.get("payment-required")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: "not_available",
      message: "Materials prices are not available yet.",
    });
  });

  it("dedupes a second pour check inside 12 hours and allows one after the window", async () => {
    const now = Date.UTC(2026, 9, 22, 8, 0, 0);
    await enqueuePrePour(db, { projectId, stageId }, now);
    await enqueuePrePour(db, { projectId, stageId }, now + 60_000);
    const first = await db.select().from(jobs).where(eq(jobs.kind, "pre_pour_check"));
    expect(first).toHaveLength(1);
    expect(first[0]?.dedupeKey).toBe(prePourDedupeKey(stageId, now));
    await enqueuePrePour(db, { projectId, stageId }, now + 12 * 60 * 60 * 1000);
    const second = await db.select().from(jobs).where(eq(jobs.kind, "pre_pour_check"));
    expect(second).toHaveLength(2);
  });

  it("does not pay when the allowance is used or a check was already recorded", async () => {
    let calls = 0;
    const blocked = await runPrePourCheck(
      db,
      { projectId, stageId, origin: "http://127.0.0.1" },
      { pay: async () => { calls += 1; return paid(false); } },
    );
    expect(blocked).toBe("failed");
    expect(calls).toBe(0);
    const notes = await db.select().from(notifications);
    expect(notes.map((row) => row.payload["text"])).toContain(
      bWx3({ project: "Lekki slab", plainReason: "the monthly allowance is used up" }),
    );
    await db.update(workspaces).set({ allowanceMicro: 2_000_000n }).where(eq(workspaces.id, workspaceId));
    const previous = process.env.X402_MAX_PER_CALL_MICRO;
    process.env.X402_MAX_PER_CALL_MICRO = "9999";
    const over = await runPrePourCheck(
      db,
      { projectId, stageId, origin: "http://127.0.0.1" },
      { pay: async () => { calls += 1; return paid(false); } },
    );
    process.env.X402_MAX_PER_CALL_MICRO = previous;
    expect(over).toBe("failed");
    expect(calls).toBe(0);
    expect(maxPerCallMicro("50000")).toBe(50_000n);
    await db.insert(x402Spend).values({
      projectId,
      stageId,
      endpoint: "/api/paid/weather",
      amountMicro: 10_000n,
      paymentResponse: { network: "eip155:84532" },
      resultSummary: "Good to pour",
    });
    const again = await runPrePourCheck(
      db,
      { projectId, stageId, origin: "http://127.0.0.1" },
      { pay: async () => { calls += 1; return paid(false); } },
    );
    expect(again).toBe("deduped");
    expect(calls).toBe(0);
  });

  it("tells the contractor and the consultant the forecast after a paid check", async () => {
    await db.delete(x402Spend).where(eq(x402Spend.stageId, stageId));
    await db.delete(notifications);
    await db.update(workspaces).set({ allowanceMicro: 2_000_000n }).where(eq(workspaces.id, workspaceId));
    const clear = await runPrePourCheck(
      db,
      { projectId, stageId, origin: "http://127.0.0.1" },
      { pay: async () => paid(false) },
    );
    expect(clear).toBe("sent");
    const clearNotes = await db.select().from(notifications);
    const clearText = bWx1({ project: "Lekki slab", stage: "Foundation concrete", pct: 18, usdc: "0.01" });
    expect(clearNotes.filter((row) => row.payload["text"] === clearText).map((row) => row.userId).sort()).toEqual(
      [contractorId, consultantId].sort(),
    );
    await db.delete(x402Spend).where(eq(x402Spend.stageId, stageId));
    await db.delete(notifications);
    const rain = await runPrePourCheck(
      db,
      { projectId, stageId, origin: "http://127.0.0.1" },
      { pay: async () => paid(true) },
    );
    expect(rain).toBe("sent");
    const rainText = bWx2({ project: "Lekki slab", pct: 72, mm: "4.5", usdc: "0.01" });
    const rainNotes = await db.select().from(notifications);
    expect(rainNotes.filter((row) => row.payload["text"] === rainText)).toHaveLength(2);
  });
});
