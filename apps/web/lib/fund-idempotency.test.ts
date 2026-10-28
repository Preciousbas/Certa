import { getDatabase, payments, projects, seedDemo, signInitData } from "@certa/db";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { POST as fund } from "../app/api/mini/fund/route";

vi.mock("@certa/chain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@certa/chain")>();
  return { ...actual, cdpConfigured: () => true };
});

vi.mock("../../../src/server/chain/flows", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/server/chain/flows")>();
  return {
    ...actual,
    fundAccepted: vi.fn(async () => ({
      tx: { txHash: `0x${"ab".repeat(32)}`, status: "pending" as const },
      amount: 1_000_000n,
      escrow: `0x${"12".repeat(20)}`,
    })),
  };
});

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

describe("USDC lock idempotency", () => {
  let projectId = "";

  beforeAll(async () => {
    const db = await getDatabase();
    await seedDemo(db);
    const project = (await db.select().from(projects)).find((row) => row.termsHash === "seeded-terms");
    if (!project) throw new Error("sample project missing");
    projectId = project.id;
  }, 30_000);

  it("records one pending USDC fund for the client and ignores the repeat key", async () => {
    const body = { projectId, upToStage: 1, idempotencyKey: "client-fund-once-0002" };
    const first = await post(fund, "fund", body, 1001);
    const second = await post(fund, "fund", body, 1001);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const opened = (await first.json()) as { created: boolean; status: string; rail: string; amountUsdc: string; paymentId: string };
    const repeat = (await second.json()) as { created: boolean; paymentId: string };
    expect(opened.created).toBe(true);
    expect(opened.status).toBe("pending");
    expect(opened.rail).toBe("usdc");
    expect(opened.amountUsdc).toMatch(/^\d+$/);
    expect(repeat.created).toBe(false);
    expect(repeat.paymentId).toBe(opened.paymentId);
    const db = await getDatabase();
    const rows = (await db.select().from(payments)).filter((row) => row.idempotencyKey === "client-fund-once-0002");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.projectId).toBe(projectId);
  });
});
