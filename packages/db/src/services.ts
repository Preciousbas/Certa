import { and, desc, eq, gt, sql } from "drizzle-orm";
import { generateJoinCode } from "@certa/shared";
import { randomBytes } from "node:crypto";
import type { Database } from "./client.js";
import { chainHash, encryptString, sha256Hex } from "./crypto.js";
import type { PartyRole, Principal } from "./policy.js";
import {
  auditLog,
  botSessions,
  joinAttempts,
  joinCodes,
  parties,
  payments,
  projects,
  users,
  workspaceMembers,
} from "./schema.js";

const JOIN_WINDOW_MS = 10 * 60 * 1000;
const JOIN_MAX_TRIES = 5;

export function newJoinCode(): string {
  return generateJoinCode(randomBytes(8));
}

export async function upsertTelegramUser(db: Database, telegramId: bigint, name: string) {
  const existing = await db.select().from(users).where(eq(users.telegramId, telegramId));
  if (existing[0]) return existing[0];
  const [created] = await db.insert(users).values({ telegramId, name }).returning();
  if (!created) throw new Error("user insert failed");
  return created;
}

export async function loadPrincipal(db: Database, userId: string): Promise<Principal> {
  const memberships = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId));
  const grants = await db.select().from(parties).where(eq(parties.userId, userId));
  return {
    userId,
    memberships: memberships.map((row) => ({
      workspaceId: row.workspaceId,
      role: row.role as Principal["memberships"][number]["role"],
    })),
    parties: grants.map((row) => ({
      partyId: row.id,
      projectId: row.projectId,
      workspaceId: row.workspaceId,
      role: row.role as PartyRole,
      canViewSubs: row.canViewSubs,
    })),
  };
}

export async function visibleProjectIds(db: Database, userId: string): Promise<string[]> {
  const principal = await loadPrincipal(db, userId);
  const ids = new Set<string>();
  for (const party of principal.parties) ids.add(party.projectId);
  if (principal.memberships.length) {
    const rows = await db.select().from(projects);
    for (const row of rows) {
      if (principal.memberships.some((item) => item.workspaceId === row.workspaceId)) ids.add(row.id);
    }
  }
  return [...ids];
}

export async function issueJoinCode(
  db: Database,
  input: { projectId: string; workspaceId: string; role: PartyRole; code?: string; ttlMs?: number },
) {
  const code = input.code ?? newJoinCode();
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? 7 * 24 * 60 * 60 * 1000));
  await db.insert(joinCodes).values({
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    role: input.role,
    codeHash: sha256Hex(code),
    expiresAt,
  });
  return { code, expiresAt };
}

export type RedeemResult =
  | { ok: true; projectId: string; partyId: string }
  | { ok: false; reason: "invalid" | "expired" | "rate_limited" };

export async function redeemJoinCode(
  db: Database,
  input: { telegramId: bigint; name: string; code: string; now?: Date },
): Promise<RedeemResult> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - JOIN_WINDOW_MS);
  const attempts = await db
    .select()
    .from(joinAttempts)
    .where(and(eq(joinAttempts.telegramId, input.telegramId), gt(joinAttempts.createdAt, since)));
  if (attempts.length >= JOIN_MAX_TRIES) return { ok: false, reason: "rate_limited" };

  const hash = sha256Hex(input.code.trim().toUpperCase());
  const rows = await db.select().from(joinCodes).where(eq(joinCodes.codeHash, hash));
  const code = rows[0];
  const fail = async (reason: "invalid" | "expired"): Promise<RedeemResult> => {
    await db.insert(joinAttempts).values({ telegramId: input.telegramId, createdAt: now });
    return { ok: false, reason };
  };
  if (!code || code.useCount >= code.maxUses) return fail("invalid");
  if (code.expiresAt.getTime() < now.getTime()) return fail("expired");

  const user = await upsertTelegramUser(db, input.telegramId, input.name);
  const [party] = await db
    .insert(parties)
    .values({ projectId: code.projectId, workspaceId: code.workspaceId, userId: user.id, role: code.role })
    .returning();
  if (!party) throw new Error("party insert failed");
  await db.update(joinCodes).set({ useCount: code.useCount + 1, updatedAt: now }).where(eq(joinCodes.id, code.id));
  await db
    .insert(botSessions)
    .values({ telegramId: input.telegramId, activeProjectId: code.projectId })
    .onConflictDoUpdate({ target: botSessions.telegramId, set: { activeProjectId: code.projectId, updatedAt: now } });
  return { ok: true, projectId: code.projectId, partyId: party.id };
}

export async function setActiveProject(db: Database, telegramId: bigint, projectId: string, userId: string) {
  const visible = await visibleProjectIds(db, userId);
  if (!visible.includes(projectId)) return false;
  await db
    .insert(botSessions)
    .values({ telegramId, activeProjectId: projectId })
    .onConflictDoUpdate({ target: botSessions.telegramId, set: { activeProjectId: projectId, updatedAt: new Date() } });
  return true;
}

export async function getActiveProjectId(db: Database, telegramId: bigint): Promise<string | null> {
  const rows = await db.select().from(botSessions).where(eq(botSessions.telegramId, telegramId));
  return rows[0]?.activeProjectId ?? null;
}

export async function ensureWallet(
  db: Database,
  partyId: string,
  create: () => Promise<{ address: string; walletId: string; mock: boolean }>,
) {
  const existing = await db.select().from(parties).where(eq(parties.id, partyId));
  const party = existing[0];
  if (!party) throw new Error("party missing");
  if (party.walletAddress && party.cdpWalletId) {
    return { address: party.walletAddress, walletId: party.cdpWalletId, mock: party.walletMock, created: false };
  }
  const wallet = await create();
  const updated = await db
    .update(parties)
    .set({ walletAddress: wallet.address, cdpWalletId: wallet.walletId, walletMock: wallet.mock, updatedAt: new Date() })
    .where(and(eq(parties.id, partyId), sql`${parties.walletAddress} is null`))
    .returning();
  if (updated[0]) return { ...wallet, created: true };
  const again = await db.select().from(parties).where(eq(parties.id, partyId));
  const row = again[0];
  if (!row?.walletAddress || !row.cdpWalletId) throw new Error("wallet missing after race");
  return { address: row.walletAddress, walletId: row.cdpWalletId, mock: row.walletMock, created: false };
}

export async function recordPayment(
  db: Database,
  input: {
    projectId: string;
    workspaceId: string;
    stageId?: string;
    kind: string;
    amountUsdc: bigint;
    amountNgnKobo: bigint;
    idempotencyKey: string;
    txHash?: string;
    status: string;
  },
) {
  const inserted = await db
    .insert(payments)
    .values({
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      stageId: input.stageId,
      kind: input.kind,
      amountUsdc: input.amountUsdc,
      amountNgnKobo: input.amountNgnKobo,
      idempotencyKey: input.idempotencyKey,
      txHash: input.txHash,
      status: input.status,
    })
    .onConflictDoNothing({ target: payments.idempotencyKey })
    .returning();
  if (inserted[0]) return { payment: inserted[0], created: true };
  const rows = await db.select().from(payments).where(eq(payments.idempotencyKey, input.idempotencyKey));
  const payment = rows[0];
  if (!payment) throw new Error("payment missing");
  return { payment, created: false };
}

export async function appendAudit(
  db: Database,
  input: { workspaceId?: string; actorUserId?: string; action: string; entity: string; entityId?: string; payload: string },
) {
  const last = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(1);
  const prev = last[0]?.rowHash ?? "genesis";
  const rowHash = chainHash(prev, input.payload);
  const [row] = await db
    .insert(auditLog)
    .values({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      prevHash: prev,
      rowHash,
      afterHash: sha256Hex(input.payload),
    })
    .returning();
  return row;
}

export function encryptEmail(email: string): string {
  return encryptString(email.trim().toLowerCase());
}
