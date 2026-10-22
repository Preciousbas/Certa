import { eq } from "drizzle-orm";
import { telegramIdentities, users, type Database } from "@certa/db";
import type { TelegramUser } from "./telegramInitData.js";

export async function upsertTelegramIdentity(db: Database, profile: TelegramUser) {
  const telegramId = BigInt(profile.id);
  const name = profile.first_name?.trim() || profile.username || "Telegram user";
  const existing = (await db.select().from(users).where(eq(users.telegramId, telegramId)))[0];
  const created = existing
    ? existing
    : (await db.insert(users).values({ telegramId, name }).returning())[0];
  if (!created) throw new Error("user insert failed");
  const identity = {
    username: profile.username ?? null,
    firstName: profile.first_name ?? null,
    lastName: profile.last_name ?? null,
    photoUrl: profile.photo_url ?? null,
    languageCode: profile.language_code ?? null,
    lastAuthAt: new Date(),
  };
  await db
    .insert(telegramIdentities)
    .values({ telegramUserId: telegramId, userId: created.id, ...identity })
    .onConflictDoUpdate({ target: telegramIdentities.telegramUserId, set: identity });
  return created;
}

export async function userByTelegram(db: Database, telegramId: bigint) {
  return (await db.select().from(users).where(eq(users.telegramId, telegramId)))[0] ?? null;
}

export async function userById(db: Database, userId: string) {
  return (await db.select().from(users).where(eq(users.id, userId)))[0] ?? null;
}
