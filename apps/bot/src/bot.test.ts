import { extractContract, textFromUpload } from "@certa/ai";
import { createMemoryDatabase, documents, projects, seedDemo, stages, users, workspaces, type Database } from "@certa/db";
import { formatOfficialRate, fxRateFromNaira, nairaToKobo, usdcFromNgnKobo } from "@certa/shared";
import { eq } from "drizzle-orm";
import type { Update } from "grammy/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBot, deliver, type BotDeps } from "./bot.js";

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

async function run(text: string, fromId: number, updateId: number, officialRate?: () => Promise<{ koboPerUsdc: bigint; asOf: string } | null>) {
  const sent: string[] = [];
  const bot = createBot("123:test", { db, paidWeather: async () => "Agent paid $0.01 for the weather check.", officialRate });
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

  it("prices the project at the Central Bank rate when one is published", async () => {
    const rate = { koboPerUsdc: 133111n, asOf: "2026-10-15" };
    const text = await run("/project", 1001, 6, async () => rate);
    expect(text).toMatch(/Central Bank rate/);
    expect(text).toContain(formatOfficialRate(rate));
    expect(text).not.toMatch(/30,000\.00 USDC/);
  });

  it("rejects a bad join code", async () => {
    const text = await run("/join NOPE9999", 4242, 4);
    expect(text).toMatch(/not valid/);
  });

  it("mentions the weather payment on /report", async () => {
    const text = await run("/report", 1001, 5);
    expect(text).toMatch(/Agent paid \$0\.01/);
  });

  it("reads a 22-stage contract file and asks for the missing terms", async () => {
    const lines = ["Stage | Description | Percent"];
    for (let index = 1; index <= 22; index += 1) {
      const percent = index <= 20 ? 4 : 10;
      lines.push(`Stage ${index} | Work ${index} | ${percent}`);
    }
    lines.push("Contract sum | 22000000", "Retention percent | 5", "Defects days | 90", "Mobilisation percent | 10");
    const csv = lines.join("\n");
    const answers = ["Ada Client", "Kemfor Construction", "Ikeja, Lagos", "none", "none", "accept"];
    const updates: Update[] = [
      documentUpdate("stages.csv", 50, 7777, 20),
      ...answers.map((text, index) => message(text, 7777, 21 + index) as Update),
    ];
    const sent: string[] = [];
    const bot = createBot("123:test", {
      db,
      officialRate: async () => ({ koboPerUsdc: 133111n, asOf: "2026-10-15" }),
      loadDocument: async () => new TextEncoder().encode(csv),
      studyContract: async (filename, bytes) => extractContract(await textFromUpload(filename, bytes)),
      apiFetch: async (input, init) => {
        const method = String(input).split("/").pop() ?? "";
        const body = init?.body ? (JSON.parse(String(init.body)) as { text?: string }) : {};
        if (method === "sendMessage" && body.text) sent.push(body.text);
        const result =
          method === "getMe"
            ? { id: 1, is_bot: true, first_name: "Certa", username: "certa_bot" }
            : { message_id: sent.length + 1, date: 1, chat: { id: 7777, type: "private", first_name: "Ada" }, text: body.text ?? "" };
        return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { "content-type": "application/json" } });
      },
    } satisfies BotDeps);
    await bot.init();
    for (const update of updates) await bot.handleUpdate(update);

    expect(sent.join("\n")).toMatch(/22 stages/);
    expect(sent.join("\n")).toMatch(/Who is the client/);
    expect(sent.join("\n")).toMatch(/Contractor code: [A-Z2-9]{8}/);
    expect(sent.join("\n")).not.toMatch(/!/);
    const project = (await db.select().from(projects)).find((row) => row.siteLocation === "Ikeja, Lagos");
    expect(project?.status).toBe("draft");
    expect(project?.escrowAddress ?? null).toBeNull();
    const stageRows = await db.select().from(stages).where(eq(stages.projectId, project!.id));
    expect(stageRows).toHaveLength(22);
    const stored = await db.select().from(documents).where(eq(documents.projectId, project!.id));
    expect(stored[0]?.parseStatus).toBe("parsed");
  });
});

function documentUpdate(fileName: string, fileSize: number, fromId: number, updateId: number): Update {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_700_000_000,
      chat: { id: fromId, type: "private", first_name: "Ada" },
      from: { id: fromId, is_bot: false, first_name: "Ada" },
      document: { file_id: "file-1", file_unique_id: "unique-1", file_name: fileName, mime_type: "text/csv", file_size: fileSize },
    },
  } as Update;
}

afterAll(async () => {
  await close();
});
