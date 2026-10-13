import { createMemoryDatabase, projects, seedDemo, users, workspaces, type Database } from "@certa/db";
import { fxRateFromNaira, nairaToKobo, usdcFromNgnKobo } from "@certa/shared";
import type { Update } from "grammy/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBot, deliver } from "./bot.js";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  process.env.DEMO_MODE = "1";
  const opened = await createMemoryDatabase();
  db = opened.db;
  close = opened.close;
  await seedDemo(db);
  const [otherUser] = await db.insert(users).values({ telegramId: 9090n, name: "Other client" }).returning();
  const [otherWs] = await db
    .insert(workspaces)
    .values({ ownerUserId: otherUser!.id, name: "Other", company: "Other Ltd" })
    .returning();
  const rate = fxRateFromNaira(1500n);
  await db.insert(projects).values({
    workspaceId: otherWs!.id,
    name: "Secret tower",
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
  });
});

function message(text: string, fromId: number, updateId: number) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_700_000_000,
      chat: { id: fromId, type: "private" as const, first_name: "Ada" },
      from: { id: fromId, is_bot: false, first_name: "Ada" },
      text,
      entities: [{ offset: 0, length: text.split(" ")[0]?.length ?? 1, type: "bot_command" as const }],
    },
  };
}

async function run(text: string, fromId: number, updateId: number) {
  const sent: string[] = [];
  const bot = createBot("123:test", { db, paidWeather: async () => "Agent paid $0.01 for the weather check." });
  await deliver(bot, message(text, fromId, updateId) as Update, sent);
  return sent.join("\n");
}

describe("bot", () => {
  it("answers /start", async () => {
    const text = await run("/start", 1001, 1);
    expect(text).toMatch(/Certa/);
    expect(text).not.toMatch(/!/);
  });

  it("shows the client project and hides the other one", async () => {
    const text = await run("/project", 1001, 2);
    expect(text).toMatch(/EM 22/);
    expect(text).toMatch(/30,000\.00 USDC/);
    expect(text).not.toMatch(/Secret tower/);
    const list = await run("/switch", 1001, 3);
    expect(list).toMatch(/EM 22/);
    expect(list).not.toMatch(/Secret tower/);
  });

  it("rejects a bad join code", async () => {
    const text = await run("/join NOPE9999", 4242, 4);
    expect(text).toMatch(/not valid/);
  });

  it("mentions the weather payment on /report", async () => {
    const text = await run("/report", 1001, 5);
    expect(text).toMatch(/Agent paid \$0\.01/);
  });
});

afterAll(async () => {
  await close();
});
