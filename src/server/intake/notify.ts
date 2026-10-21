import { memberships, notifications, projects, users, type Database } from "@certa/db";
import { eq, inArray } from "drizzle-orm";
import { figuresReady, planShared, replyReminder, reviewLink, acceptDeepLink } from "./messages.js";
import { pctFromBps } from "./amounts.js";
import { formatNaira } from "../../lib/money/kobo.js";

export type TelegramSender = (chatId: string, text: string) => Promise<void>;

async function defaultTelegramSend(chatId: string, text: string): Promise<void> {
  if (process.env.VITEST) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!response.ok) throw new Error("Telegram did not accept the message.");
}

export async function notifyOnce(
  db: Database,
  input: { userId: string; chatId: string; kind: string; dedupeKey: string; text: string; send?: TelegramSender },
): Promise<"sent" | "duplicate" | "skipped"> {
  if (!input.chatId) return "skipped";
  const inserted = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      kind: input.kind,
      payload: { text: input.text },
      channel: "telegram",
      status: "queued",
      dedupeKey: input.dedupeKey,
    })
    .onConflictDoNothing()
    .returning();
  if (!inserted[0]) return "duplicate";
  try {
    await (input.send ?? defaultTelegramSend)(input.chatId, input.text);
    await db.update(notifications).set({ status: "sent", sentAt: new Date() }).where(eq(notifications.id, inserted[0].id));
    return "sent";
  } catch {
    await db.update(notifications).set({ status: "failed" }).where(eq(notifications.id, inserted[0].id));
    return "skipped";
  }
}

type SavedStage = { name: string; amountKobo: string };

export async function notifyFigures(
  db: Database,
  input: {
    projectId: string;
    extractionId: string;
    userIds: string[];
    projectName: string;
    contractSumKobo: bigint | null;
    vatBps: number;
    retentionBps: number;
    defectsMonths: number;
    stages: SavedStage[];
    warnings: number;
    send?: TelegramSender;
  },
): Promise<void> {
  if (input.userIds.length === 0) return;
  const people = await db.select().from(users).where(inArray(users.id, input.userIds));
  const text = figuresReady({
    project: input.projectName,
    sum: input.contractSumKobo === null ? "not found" : formatNaira(input.contractSumKobo),
    vatPct: pctFromBps(input.vatBps),
    stages: input.stages.length,
    retentionPct: pctFromBps(input.retentionBps),
    months: input.defectsMonths,
    warnings: input.warnings,
    link: reviewLink(input.projectId),
  });
  for (const person of people) {
    await notifyOnce(db, {
      userId: person.id,
      chatId: person.telegramId.toString(),
      kind: "contract_read",
      dedupeKey: `bex:${input.extractionId}:${person.id}`,
      text,
      send: input.send,
    });
  }
}

export async function notifyPlanShared(
  db: Database,
  input: {
    projectId: string;
    versionId: string;
    clientName: string;
    projectName: string;
    sumKobo: bigint;
    stageLines: string;
    retentionBps: number;
    defectsMonths: number;
    send?: TelegramSender;
  },
): Promise<void> {
  const members = (await db.select().from(memberships).where(eq(memberships.projectId, input.projectId))).filter((row) => row.role === "contractor");
  if (members.length === 0) return;
  const people = await db.select().from(users).where(inArray(users.id, members.map((row) => row.userId)));
  const text = planShared({
    clientName: input.clientName,
    project: input.projectName,
    sum: formatNaira(input.sumKobo),
    stageLines: input.stageLines,
    retentionPct: pctFromBps(input.retentionBps),
    months: input.defectsMonths,
    link: acceptDeepLink(input.projectId),
  });
  for (const person of people) {
    await notifyOnce(db, {
      userId: person.id,
      chatId: person.telegramId.toString(),
      kind: "contract_accept",
      dedupeKey: `bac:${input.versionId}:${person.id}`,
      text,
      send: input.send,
    });
  }
}

export async function deliverContractReply(
  db: Database,
  input: { projectId: string; versionId: string; hoursLeft: number; send?: TelegramSender },
): Promise<number> {
  if (input.hoursLeft !== 0) return 0;
  const project = (await db.select().from(projects).where(eq(projects.id, input.projectId)))[0];
  if (!project) return 0;
  const members = await db.select().from(memberships).where(eq(memberships.projectId, input.projectId));
  if (members.length === 0) return 0;
  const people = await db.select().from(users).where(inArray(users.id, members.map((row) => row.userId)));
  const text = replyReminder(project.name, input.hoursLeft);
  let sent = 0;
  for (const person of people) {
    const result = await notifyOnce(db, {
      userId: person.id,
      chatId: person.telegramId.toString(),
      kind: "contract_reply",
      dedupeKey: `contract-reply:${input.versionId}:72:${person.id}`,
      text,
      send: input.send,
    });
    if (result === "sent") sent += 1;
  }
  return sent;
}
