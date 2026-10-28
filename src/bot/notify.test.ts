import { createMemoryDatabase, jobs, memberships, notifications, projects, users, workspaces, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { notifyFundOutcome } from "./fundNotice.js";
import { deliverNotification, notify, type TelegramPost } from "./notify.js";
import { notifyVerdict } from "../server/verify/notify.js";

let db: Database;
let close: () => Promise<void>;
let projectId = "";
let clientId = "";
let contractorId = "";
let consultantId = "";

beforeAll(async () => {
  const opened = await createMemoryDatabase();
  db = opened.db;
  close = opened.close;
  const [client] = await db.insert(users).values({ telegramId: 8101n, name: "Ada Client" }).returning();
  const [contractor] = await db.insert(users).values({ telegramId: 8102n, name: "Kemfor Construction" }).returning();
  const [consultant] = await db.insert(users).values({ telegramId: 8103n, name: "Engr Okafor" }).returning();
  if (!client || !contractor || !consultant) throw new Error("users");
  clientId = client.id;
  contractorId = contractor.id;
  consultantId = consultant.id;
  const [workspace] = await db.insert(workspaces).values({ ownerUserId: client.id, name: "Ada", company: "Ada Ltd" }).returning();
  if (!workspace) throw new Error("workspace");
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
  await db.insert(memberships).values([
    { projectId, userId: client.id, role: "client" },
    { projectId, userId: contractor.id, role: "contractor" },
    { projectId, userId: consultant.id, role: "consultant" },
  ]);
});

afterAll(async () => {
  await close();
});

async function note(userId: string, dedupeKey: string) {
  const [row] = await db
    .insert(notifications)
    .values({ userId, kind: "B-GE-2", payload: { text: "hello" }, channel: "telegram", status: "queued", dedupeKey })
    .returning();
  if (!row) throw new Error("notification");
  return row.id;
}

describe("deliverNotification", () => {
  it("marks the membership blocked on 403 and waits retry_after on 429", async () => {
    const blockedId = await note(clientId, "notify-403");
    const blocked = await deliverNotification(
      db,
      { notificationId: blockedId, userId: clientId, chatId: "8101", text: "hello" },
      {
        now: () => 1_000_000,
        sleep: async () => undefined,
        post: async () => ({ ok: false, status: 403 }),
      },
    );
    expect(blocked).toBe("blocked");
    const member = (await db.select().from(memberships).where(eq(memberships.userId, clientId)))[0];
    expect(member?.notifyChannel).toBe("blocked");
    const stored = (await db.select().from(notifications).where(eq(notifications.id, blockedId)))[0];
    expect(stored?.status).toBe("blocked");

    const retryId = await note(contractorId, "notify-429");
    const slept: number[] = [];
    let calls = 0;
    const post: TelegramPost = async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 429, retryAfter: 2 };
      return { ok: true };
    };
    const sent = await deliverNotification(
      db,
      { notificationId: retryId, userId: contractorId, chatId: "8102", text: "locked" },
      {
        now: () => 2_000_000,
        sleep: async (ms) => {
          slept.push(ms);
        },
        post,
      },
    );
    expect(sent).toBe("sent");
    expect(calls).toBe(2);
    expect(slept).toEqual([2000]);
    const retried = (await db.select().from(notifications).where(eq(notifications.id, retryId)))[0];
    expect(retried?.status).toBe("sent");
  });
});

describe("notify", () => {
  it("sends immediately when the bot token is set", async () => {
    const previousVitest = process.env.VITEST;
    const previousToken = process.env.TELEGRAM_BOT_TOKEN;
    const originalFetch = globalThis.fetch;
    delete process.env.VITEST;
    process.env.TELEGRAM_BOT_TOKEN = "123:test";
    globalThis.fetch = async () => new Response("{}", { status: 200 });
    try {
      const result = await notify(db, {
        userId: clientId,
        messageId: "B-AP-1",
        text: "Approve the stage.",
        dedupeKey: "immediate-approve",
        chatId: "8101",
      });
      expect(result).toBe("queued");
      const queued = await db.select().from(jobs).where(eq(jobs.dedupeKey, "notify:immediate-approve"));
      expect(queued).toHaveLength(0);
      const stored = (await db.select().from(notifications).where(eq(notifications.dedupeKey, "immediate-approve")))[0];
      expect(stored?.status).toBe("sent");
    } finally {
      if (previousVitest === undefined) delete process.env.VITEST;
      else process.env.VITEST = previousVitest;
      if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
      else process.env.TELEGRAM_BOT_TOKEN = previousToken;
      globalThis.fetch = originalFetch;
    }
  });
});

describe("fund notices", () => {
  it("queues B-FU-2 and B-FU-3 when the lock is confirmed, and B-FU-4 when it fails", async () => {
    await notifyFundOutcome(db, {
      outcome: "confirmed",
      projectId,
      projectName: "Plot 14 Lekki",
      clientUserId: clientId,
      clientName: "Ada Client",
      amountKobo: 100_000n,
      fromStage: 1,
      toStage: 2,
      explorerLink: "https://sepolia.etherscan.io/tx/0xabc",
      plainReason: "",
      supportEmail: "support@example.com",
      idempotencyKey: "fund-ok",
    });
    await notifyFundOutcome(db, {
      outcome: "failed",
      projectId,
      projectName: "Plot 14 Lekki",
      clientUserId: clientId,
      clientName: "Ada Client",
      amountKobo: 0n,
      fromStage: 1,
      toStage: 2,
      explorerLink: "",
      plainReason: "The fund transaction reverted.",
      supportEmail: "support@example.com",
      idempotencyKey: "fund-no",
    });
    const queued = await db.select().from(jobs).where(eq(jobs.kind, "notify_telegram"));
    const texts = queued.map((row) => (typeof row.payload.text === "string" ? row.payload.text : ""));
    expect(texts.some((text) => text.includes("Locked") && text.includes("stages 1"))).toBe(true);
    expect(texts.some((text) => text.includes("Good news") && text.includes("Ada Client"))).toBe(true);
    expect(texts.some((text) => text.includes("wasn't locked"))).toBe(true);
    const kinds = queued.map((row) => (typeof row.payload.text === "string" ? row.dedupeKey : ""));
    expect(kinds.filter((key) => key === "notify:bfu2:fund-ok" || key === "notify:bfu3:fund-ok:" + contractorId || key === "notify:bfu4:fund-no")).toHaveLength(3);
  });
});

describe("verdict notices", () => {
  it("puts certify, reject, and send-new-photos buttons on B-VF-1, B-VF-4, and B-VF-5", async () => {
    await notifyVerdict(db, ["B-VF-1", "B-VF-4", "B-VF-5"], {
      projectId,
      projectName: "Plot 14 Lekki",
      submissionId: "sub-1",
      stageId: "11111111-1111-1111-1111-111111111111",
      stageNumber: 2,
      stageName: "Roof",
      amountKobo: 50_000n,
      confidencePct: 91,
      reasons: ["the covering is complete"],
      issues: ["the flashing is open"],
      missingShots: ["the ridge"],
      safetyFlags: [],
    });
    const queued = await db.select().from(jobs).where(eq(jobs.kind, "notify_telegram"));
    const buttons = queued.flatMap((row) => {
      const keyboard = row.payload.keyboard;
      if (!Array.isArray(keyboard)) return [];
      return keyboard.flatMap((line) => (Array.isArray(line) ? line : []));
    });
    const field = (button: unknown, key: "text" | "data"): string => {
      if (!button || typeof button !== "object") return "";
      const record = button as Record<string, unknown>;
      const value = record[key];
      return typeof value === "string" ? value : "";
    };
    const labels = buttons.map((button) => field(button, "text"));
    expect(labels).toContain("Certify");
    expect(labels).toContain("Reject");
    expect(labels).toContain("Send new photos");
    expect(labels).toContain("Send more photos");
    const data = buttons.map((button) => field(button, "data"));
    expect(data.some((item) => item.startsWith("v1:cf:"))).toBe(true);
    expect(data.some((item) => item.startsWith("v1:rj:"))).toBe(true);
    expect(data.some((item) => item.startsWith("v1:ph:"))).toBe(true);
    expect(consultantId).toBeTruthy();
  });
});
