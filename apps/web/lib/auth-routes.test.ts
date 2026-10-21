import { getDatabase, projects, seedDemo, signInitData, stages } from "@certa/db";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { clearCbnRateCache } from "./cbn-rate";
import { POST as fund } from "../app/api/mini/fund/route";
import { POST as nonce } from "../app/api/mini/nonce/route";

process.env.DEMO_SEED = "true";
process.env.DEMO_MODE = "1";
process.env.TELEGRAM_BOT_TOKEN = "123:test";
process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars";
process.env.APP_URL = "http://localhost:3000";

const token = process.env.TELEGRAM_BOT_TOKEN;

function initData(telegramId: number) {
  const now = Math.floor(Date.now() / 1000);
  return signInitData({ auth_date: String(now), user: JSON.stringify({ id: telegramId, first_name: "Ada" }) }, token);
}

async function post(handler: (request: Request) => Promise<Response>, path: string, body: unknown, telegramId?: number) {
  const headers = new Headers({ "content-type": "application/json" });
  if (telegramId) headers.set("authorization", `tma ${initData(telegramId)}`);
  return handler(new Request(`http://localhost/api/mini/${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
}

describe("mini app auth", () => {
  let projectId = "";
  let stageId = "";

  beforeAll(async () => {
    const db = await getDatabase();
    await seedDemo(db);
    const project = (await db.select().from(projects)).find((row) => row.termsHash === "seeded-terms");
    if (!project) throw new Error("sample project missing");
    projectId = project.id;
    const stage = (await db.select().from(stages).where(eq(stages.projectId, project.id)))[0];
    if (!stage) throw new Error("sample stage missing");
    stageId = stage.id;
  }, 30_000);

  it("rejects a nonce request with no initData", async () => {
    const response = await post(nonce, "nonce", { projectId, stageId });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("not_signed_in");
    expect(body.message).toBe("Sign in from Telegram.");
  });

  it("lets a subcontractor open a nonce and blocks them from funding", async () => {
    const opened = await post(nonce, "nonce", { projectId, stageId }, 1004);
    expect(opened.status).toBe(200);
    const funded = await post(fund, "fund", { projectId, upToStage: 1, idempotencyKey: "sub-should-not-fund" }, 1004);
    expect(funded.status).toBe(403);
  });

  it("records one pending fund for the client and ignores the repeat key", async () => {
    const body = { projectId, upToStage: 1, idempotencyKey: "client-fund-once-0001" };
    const first = await post(fund, "fund", body, 1001);
    expect(first.status).toBe(200);
    const created = (await first.json()) as { created: boolean; status: string; amountUsdc: string };
    expect(created.created).toBe(true);
    expect(created.status).toBe("pending");
    expect(created.amountUsdc).toMatch(/^\d+$/);
    const second = await post(fund, "fund", body, 1001);
    expect(second.status).toBe(200);
    expect(((await second.json()) as { created: boolean }).created).toBe(false);
  });

  it("records a naira deposit without a chain transaction", async () => {
    clearCbnRateCache();
    vi.stubGlobal(
      "fetch",
      async () => new Response('[{"date":"2026-10-15","base":"USD","quote":"NGN","rate":1331.1139}]', { status: 200 }),
    );
    const response = await post(
      fund,
      "fund",
      { projectId, upToStage: 0, idempotencyKey: "client-naira-once-0001", currency: "ngn" },
      1001,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { created: boolean; status: string; rail: string; txHash: string | null; amountNgnKobo: string };
    expect(body.created).toBe(true);
    expect(body.status).toBe("pending");
    expect(body.rail).toBe("ngn");
    expect(body.txHash).toBeNull();
    expect(body.amountNgnKobo).toMatch(/^[1-9]\d*$/);
    vi.unstubAllGlobals();
    clearCbnRateCache();
  });
});
