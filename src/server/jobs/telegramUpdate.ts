import { eq } from "drizzle-orm";
import { getDatabase, telegramUpdates, type Database } from "@certa/db";
import { telegramUpdateSchema, type TelegramUpdate } from "../auth/webhook.js";
import { registerJobHandler } from "./worker.js";

export type TelegramDispatch = (update: TelegramUpdate) => Promise<void>;

let dispatch: TelegramDispatch | undefined;

export function setTelegramUpdateDispatch(fn: TelegramDispatch): void {
  dispatch = fn;
}

export async function handleTelegramUpdate(payload: Record<string, unknown>, db?: Database): Promise<void> {
  const parsed = telegramUpdateSchema.safeParse(payload);
  if (!parsed.success) return;
  const database = db ?? (await getDatabase());
  const id = BigInt(parsed.data.update_id);
  const row = (await database.select().from(telegramUpdates).where(eq(telegramUpdates.updateId, id)))[0];
  if (!row || row.processedAt) return;
  const run = dispatch;
  if (!run) throw new Error("Telegram update dispatch is not configured.");
  await run(parsed.data);
  await database.update(telegramUpdates).set({ processedAt: new Date() }).where(eq(telegramUpdates.updateId, id));
}

registerJobHandler("telegram.update", (payload) => handleTelegramUpdate(payload));
