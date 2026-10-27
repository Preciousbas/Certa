import { memberships, notifications, projects, users, type Database } from "@certa/db";
import { eq, inArray } from "drizzle-orm";
import { callbackData } from "../../bot/callbacks.js";
import { figuresReady, planShared, readFailed, replyReminder, reviewLink } from "./messages.js";
import { pctFromBps } from "./amounts.js";
import { formatNaira } from "../../lib/money/kobo.js";

export type TelegramButton = { text: string; callback_data: string } | { text: string; web_app: { url: string } };

export type TelegramMarkup = { inline_keyboard: TelegramButton[][] };

export type TelegramSender = (chatId: string, text: string, markup?: TelegramMarkup) => Promise<void>;

async function defaultTelegramSend(chatId: string, text: string, markup?: TelegramMarkup): Promise<void> {
  if (process.env.VITEST) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...(markup ? { reply_markup: markup } : {}) }),
  });
  if (!response.ok) throw new Error("Telegram did not accept the message.");
}

export async function notifyOnce(
  db: Database,
  input: { userId: string; chatId: string; kind: string; dedupeKey: string; text: string; markup?: TelegramMarkup; send?: TelegramSender },
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
    await (input.send ?? defaultTelegramSend)(input.chatId, input.text, input.markup);
    await db.update(notifications).set({ status: "sent", sentAt: new Date() }).where(eq(notifications.id, inserted[0].id));
    return "sent";
  } catch {
    await db.update(notifications).set({ status: "failed" }).where(eq(notifications.id, inserted[0].id));
    return "skipped";
  }
}

export async function notifyReadFailed(
  db: Database,
  input: { projectId: string; userIds: string[]; fileName: string; detail: string; send?: TelegramSender },
): Promise<void> {
  if (input.userIds.length === 0) return;
  const people = await db.select().from(users).where(inArray(users.id, input.userIds));
  const text = readFailed(input.fileName, input.detail);
  const markup: TelegramMarkup = { inline_keyboard: [[{ text: "Retry", callback_data: `v1:rx:${input.projectId}` }]] };
  for (const person of people) {
    await notifyOnce(db, {
      userId: person.id,
      chatId: person.telegramId.toString(),
      kind: "contract_read_failed",
      dedupeKey: `bread:${input.projectId}:${person.id}:${Date.now()}`,
      text,
      markup,
      send: input.send,
    });
  }
}

type SavedStage = { name: string; amountKobo: string; kind?: string };

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
    lines?: string[];
    basis?: string | null;
    notes?: string[];
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
    stages: input.stages.filter((stage) => stage.kind !== "reserve").length,
    lines: input.lines,
    basis: input.basis,
    notes: input.notes,
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
  const members = (await db.select().from(memberships).where(eq(memberships.projectId, input.projectId))).filter(
    (row) => (row.role === "contractor" || row.role === "client") && row.status === "active",
  );
  if (members.length === 0) return;
  const roleOf = new Map(members.map((row) => [row.userId, row.role]));
  const people = await db.select().from(users).where(inArray(users.id, members.map((row) => row.userId)));
  for (const person of people) {
    const role = roleOf.get(person.id) ?? "";
    const text = planShared({
      clientName: input.clientName,
      project: input.projectName,
      sum: formatNaira(input.sumKobo),
      stageLines: input.stageLines,
      retentionPct: pctFromBps(input.retentionBps),
      months: input.defectsMonths,
      forClient: role === "client",
    });
    const keyboard: TelegramMarkup["inline_keyboard"] = [
      [{ text: "Review plan", web_app: { url: reviewLink(input.projectId) } }],
      [{ text: "Accept", callback_data: callbackData("ac", input.versionId, "yes") }],
    ];
    if (role === "contractor") keyboard.push([{ text: "Ask for a change", callback_data: callbackData("ac", input.versionId, "change") }]);
    await notifyOnce(db, {
      userId: person.id,
      chatId: person.telegramId.toString(),
      kind: "contract_accept",
      dedupeKey: `bac:${input.versionId}:${person.id}`,
      text,
      markup: { inline_keyboard: keyboard },
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
