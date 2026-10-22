import { botSessions, type Database } from "@certa/db";
import { eq } from "drizzle-orm";

export const STEP_TTL_MS = 15 * 60 * 1000;

export type SessionData = Record<string, string>;

export type SessionRecord = {
  step: string | null;
  projectId: string | null;
  data: SessionData;
  expiresAt: Date | null;
};

function asData(value: unknown): SessionData {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const data = record.data;
  if (!data || typeof data !== "object") return {};
  const out: SessionData = {};
  for (const [key, item] of Object.entries(data)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

export async function readSession(db: Database, telegramId: bigint, now = new Date()): Promise<SessionRecord> {
  const row = (await db.select().from(botSessions).where(eq(botSessions.telegramId, telegramId)))[0];
  if (!row) return { step: null, projectId: null, data: {}, expiresAt: null };
  const state = row.state as { step?: string; projectId?: string } | null;
  const expired = row.stateExpiresAt ? row.stateExpiresAt.getTime() < now.getTime() : false;
  return {
    step: expired ? null : (state?.step ?? null),
    projectId: row.activeProjectId,
    data: expired ? {} : asData(row.state),
    expiresAt: row.stateExpiresAt,
  };
}

export async function writeSession(
  db: Database,
  telegramId: bigint,
  input: { step: string | null; projectId?: string | null; data?: SessionData; ttlMs?: number },
  now = new Date(),
): Promise<void> {
  const expiresAt = input.step ? new Date(now.getTime() + (input.ttlMs ?? STEP_TTL_MS)) : null;
  const state = input.step
    ? {
        step: input.step,
        projectId: input.projectId ?? null,
        data: input.data ?? {},
        ...(input.step === "upload" ? { mode: "awaiting_documents" as const } : {}),
      }
    : null;
  await db
    .insert(botSessions)
    .values({
      telegramId,
      activeProjectId: input.projectId ?? null,
      state,
      stateExpiresAt: expiresAt,
    })
    .onConflictDoUpdate({
      target: botSessions.telegramId,
      set: {
        ...(input.projectId !== undefined ? { activeProjectId: input.projectId } : {}),
        state,
        stateExpiresAt: expiresAt,
        updatedAt: now,
      },
    });
}
