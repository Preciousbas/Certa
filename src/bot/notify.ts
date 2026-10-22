import { memberships, notifications, users, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { enqueueJob } from "../server/jobs/enqueue.js";
import { registerJobHandler } from "../server/jobs/worker.js";
import { toHtml } from "./html.js";
import { telegramMarkup, type BotButton, type BotKeyboard } from "./keyboards.js";

export type NotifyInput = {
  userId: string;
  messageId: string;
  text: string;
  dedupeKey: string;
  chatId?: string;
  keyboard?: BotKeyboard;
};

const globalSends: number[] = [];
const chatNext = new Map<string, number>();

export type TelegramPost = (
  chatId: string,
  text: string,
  markup?: ReturnType<typeof telegramMarkup>,
) => Promise<{ ok: true } | { ok: false; status: number; retryAfter?: number; description?: string }>;

export function resetNotifyLimits(): void {
  globalSends.length = 0;
  chatNext.clear();
}

async function waitTurn(chatId: string, now: () => number, sleep: (ms: number) => Promise<void>): Promise<void> {
  for (;;) {
    const stamp = now();
    while (globalSends.length > 0 && (globalSends[0] ?? 0) <= stamp - 1000) globalSends.shift();
    const chatAt = chatNext.get(chatId) ?? 0;
    if (globalSends.length >= 30) {
      await sleep((globalSends[0] ?? stamp) + 1000 - stamp);
      continue;
    }
    if (chatAt > stamp) {
      await sleep(chatAt - stamp);
      continue;
    }
    globalSends.push(stamp);
    chatNext.set(chatId, stamp + 1000);
    return;
  }
}

export async function postTelegram(
  chatId: string,
  text: string,
  markup?: ReturnType<typeof telegramMarkup>,
  token = process.env.TELEGRAM_BOT_TOKEN ?? "",
): Promise<{ ok: true } | { ok: false; status: number; retryAfter?: number; description?: string }> {
  if (!token || !chatId) return { ok: false, status: 0, description: "missing" };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: toHtml(text),
      parse_mode: "HTML",
      ...(markup ? { reply_markup: markup } : {}),
    }),
  });
  if (response.ok) return { ok: true };
  const body = (await response.json().catch(() => ({}))) as { parameters?: { retry_after?: number }; description?: string };
  return { ok: false, status: response.status, retryAfter: body.parameters?.retry_after, description: body.description };
}

export async function deliverNotification(
  db: Database,
  input: { notificationId: string; chatId: string; text: string; userId: string },
  options?: { post?: TelegramPost; now?: () => number; sleep?: (ms: number) => Promise<void>; keyboard?: BotKeyboard },
): Promise<"sent" | "blocked" | "retry"> {
  const post = options?.post ?? postTelegram;
  const now = options?.now ?? Date.now;
  const sleep = options?.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const markup = options?.keyboard ? telegramMarkup(options.keyboard) : undefined;
  await waitTurn(input.chatId, now, sleep);
  let result = await post(input.chatId, input.text, markup);
  if (!result.ok && result.status === 429) {
    await sleep((result.retryAfter ?? 1) * 1000);
    result = await post(input.chatId, input.text, markup);
  }
  if (!result.ok && result.status === 403) {
    await db.update(memberships).set({ notifyChannel: "blocked" }).where(eq(memberships.userId, input.userId));
    await db.update(notifications).set({ status: "blocked" }).where(eq(notifications.id, input.notificationId));
    return "blocked";
  }
  if (!result.ok) {
    await db.update(notifications).set({ status: "failed" }).where(eq(notifications.id, input.notificationId));
    return "retry";
  }
  await db.update(notifications).set({ status: "sent", sentAt: new Date() }).where(eq(notifications.id, input.notificationId));
  return "sent";
}

export async function notify(db: Database, input: NotifyInput): Promise<"queued" | "duplicate"> {
  const inserted = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      kind: input.messageId,
      payload: { text: input.text, messageId: input.messageId },
      channel: "telegram",
      status: "queued",
      dedupeKey: input.dedupeKey,
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning();
  const row = inserted[0];
  if (!row) return "duplicate";
  let chatId = input.chatId ?? "";
  if (!chatId) {
    const user = (await db.select().from(users).where(eq(users.id, input.userId)))[0];
    chatId = user ? user.telegramId.toString() : "";
  }
  await enqueueJob(db, {
    kind: "notify_telegram",
    dedupeKey: `notify:${input.dedupeKey}`,
    payload: {
      notificationId: row.id,
      userId: input.userId,
      chatId,
      text: input.text,
      ...(input.keyboard ? { keyboard: input.keyboard } : {}),
    },
  });
  return "queued";
}

function textField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function buttonField(value: unknown): BotButton | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const text = textField(record.text);
  if (!text) return undefined;
  if (record.kind === "callback") {
    const data = textField(record.data);
    return data ? { kind: "callback", text, data } : undefined;
  }
  if (record.kind === "web_app") {
    const url = textField(record.url);
    return url ? { kind: "web_app", text, url } : undefined;
  }
  if (record.kind === "switch") {
    const query = textField(record.query);
    return query ? { kind: "switch", text, query } : undefined;
  }
  return undefined;
}

function keyboardField(value: unknown): BotKeyboard | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows: BotKeyboard = [];
  for (const row of value) {
    if (!Array.isArray(row)) return undefined;
    const buttons: BotButton[] = [];
    for (const button of row) {
      const parsed = buttonField(button);
      if (!parsed) return undefined;
      buttons.push(parsed);
    }
    rows.push(buttons);
  }
  return rows;
}

export function registerNotifyJobs(options?: { post?: TelegramPost; sleep?: (ms: number) => Promise<void> }): void {
  registerJobHandler("notify_telegram", async (payload) => {
    const notificationId = textField(payload.notificationId);
    const userId = textField(payload.userId);
    const chatId = textField(payload.chatId);
    const text = textField(payload.text);
    if (!notificationId || !userId || !chatId) return;
    const { getDatabase } = await import("@certa/db");
    const db = await getDatabase();
    const result = await deliverNotification(
      db,
      { notificationId, userId, chatId, text },
      { ...options, keyboard: keyboardField(payload.keyboard) },
    );
    if (result === "retry") throw new Error("Telegram did not accept the message.");
  });
}
