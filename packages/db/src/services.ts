import { and, desc, eq, gt, sql } from "drizzle-orm";
import { generateJoinCode, usdcFromNgnKobo } from "@certa/shared";
import { randomBytes } from "node:crypto";
import type { Database } from "./client.js";
import { chainHash, encryptString, sha256Hex } from "./crypto.js";
import type { PartyRole, Principal } from "./policy.js";
import {
  auditLog,
  blobs,
  botSessions,
  contractAcceptances,
  contractSummaries,
  contractVersions,
  documents,
  memberships,
  joinAttempts,
  joinCodes,
  parties,
  payments,
  projects,
  stages,
  users,
  workspaceMembers,
  workspaces,
} from "./schema.js";

const JOIN_WINDOW_MS = 10 * 60 * 1000;
const JOIN_MAX_TRIES = 5;

export function newJoinCode(): string {
  return generateJoinCode(randomBytes(8));
}

export const CONTRACT_SIDES = ["client", "contractor"] as const;
export type ContractSide = (typeof CONTRACT_SIDES)[number];
export const STARTER_ROLES = CONTRACT_SIDES;
export type StarterRole = ContractSide;

export function oppositeSide(role: ContractSide): ContractSide {
  return role === "client" ? "contractor" : "client";
}

export function partyRoleFor(role: ContractSide | "consultant" | "subcontractor"): PartyRole {
  return role === "contractor" ? "main_contractor" : role;
}

export function membershipRoleFor(partyRole: string): string {
  return partyRole === "main_contractor" ? "contractor" : partyRole;
}

export async function startOwnProject(
  db: Database,
  input: { telegramId: bigint; name: string; projectName: string; role: StarterRole; site?: string },
) {
  const projectName = input.projectName.trim().slice(0, 180);
  if (!projectName) throw new Error("project name missing");
  if (!STARTER_ROLES.includes(input.role)) throw new Error("role missing");
  const user = await upsertTelegramUser(db, input.telegramId, input.name);
  const owned = await db.select().from(workspaces).where(eq(workspaces.ownerUserId, user.id));
  let workspace = owned[0];
  if (!workspace) {
    const [created] = await db
      .insert(workspaces)
      .values({ ownerUserId: user.id, name: projectName, company: input.name.slice(0, 180) })
      .returning();
    if (!created) throw new Error("workspace insert failed");
    workspace = created;
  }
  const member = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, user.id)));
  if (!member[0]) {
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: "owner" });
  }
  const [project] = await db
    .insert(projects)
    .values({
      workspaceId: workspace.id,
      name: projectName,
      siteLocation: (input.site?.trim() || "Not set yet").slice(0, 240),
      siteLat: 0,
      siteLng: 0,
      geofenceRadiusM: 150,
      status: "draft",
      fxRateLocked: 0n,
      fxSource: "unset",
      spendingCapUsdc: 0n,
      retentionBps: 0,
      defectsPeriodDays: 0,
      contractSumKobo: 0n,
      contractSumUsdc: 0n,
    })
    .returning();
  if (!project) throw new Error("project insert failed");
  const [party] = await db
    .insert(parties)
    .values({
      projectId: project.id,
      workspaceId: workspace.id,
      userId: user.id,
      role: partyRoleFor(input.role),
    })
    .returning();
  if (!party) throw new Error("party insert failed");
  await db.insert(memberships).values({ projectId: project.id, userId: user.id, role: input.role }).onConflictDoNothing();
  await db
    .insert(botSessions)
    .values({ telegramId: input.telegramId, activeProjectId: project.id })
    .onConflictDoUpdate({
      target: botSessions.telegramId,
      set: { activeProjectId: project.id, updatedAt: new Date() },
    });
  const other = oppositeSide(input.role);
  const invite = await issueJoinCode(db, {
    projectId: project.id,
    workspaceId: workspace.id,
    role: partyRoleFor(other),
  });
  return {
    projectId: project.id,
    workspaceId: workspace.id,
    userId: user.id,
    role: input.role,
    partyId: party.id,
    inviteCode: invite.code,
    inviteRole: other,
    inviteExpiresAt: invite.expiresAt,
  };
}

export async function upsertTelegramUser(db: Database, telegramId: bigint, name: string) {
  const existing = await db.select().from(users).where(eq(users.telegramId, telegramId));
  if (existing[0]) return existing[0];
  const [created] = await db.insert(users).values({ telegramId, name }).returning();
  if (!created) throw new Error("user insert failed");
  return created;
}

export async function loadPrincipal(db: Database, userId: string): Promise<Principal> {
  const memberships = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));
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
      if (principal.memberships.some((item) => item.workspaceId === row.workspaceId))
        ids.add(row.id);
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
  | { ok: true; projectId: string; partyId: string; role: string; projectName: string }
  | { ok: false; reason: "invalid" | "expired" | "rate_limited" | "revoked" | "taken" };

export async function redeemJoinCode(
  db: Database,
  input: { telegramId: bigint; name: string; code: string; now?: Date; projectId?: string },
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
  const fail = async (reason: "invalid" | "expired" | "revoked"): Promise<RedeemResult> => {
    await db.insert(joinAttempts).values({ telegramId: input.telegramId, createdAt: now });
    return { ok: false, reason };
  };
  if (!code || code.useCount >= code.maxUses) return fail("invalid");
  if (code.revokedAt) return fail("revoked");
  if (code.expiresAt.getTime() < now.getTime()) return fail("expired");
  if (input.projectId && input.projectId !== code.projectId) return fail("invalid");

  const membershipRole = membershipRoleFor(code.role);
  const filled = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.projectId, code.projectId), eq(memberships.role, membershipRole), eq(memberships.status, "active")));
  if (filled.length > 0) return { ok: false, reason: "taken" };

  const user = await upsertTelegramUser(db, input.telegramId, input.name);
  const [party] = await db
    .insert(parties)
    .values({
      projectId: code.projectId,
      workspaceId: code.workspaceId,
      userId: user.id,
      role: code.role,
    })
    .returning();
  if (!party) throw new Error("party insert failed");
  const joinedRole = membershipRoleFor(party.role);
  if (["client", "consultant", "contractor", "subcontractor", "viewer"].includes(joinedRole)) {
    await db.insert(memberships).values({ projectId: code.projectId, userId: user.id, role: joinedRole }).onConflictDoNothing();
  }
  await db
    .update(joinCodes)
    .set({ useCount: code.useCount + 1, updatedAt: now })
    .where(eq(joinCodes.id, code.id));
  await db
    .insert(botSessions)
    .values({ telegramId: input.telegramId, activeProjectId: code.projectId })
    .onConflictDoUpdate({
      target: botSessions.telegramId,
      set: { activeProjectId: code.projectId, updatedAt: now },
    });
  const project = (await db.select().from(projects).where(eq(projects.id, code.projectId)))[0];
  return { ok: true, projectId: code.projectId, partyId: party.id, role: joinedRole, projectName: project?.name ?? "" };
}

export async function revokeJoinCode(db: Database, input: { projectId: string; code: string; now?: Date }): Promise<boolean> {
  const hash = sha256Hex(input.code.trim().toUpperCase());
  const rows = await db.select().from(joinCodes).where(eq(joinCodes.codeHash, hash));
  const code = rows[0];
  if (!code || code.projectId !== input.projectId) return false;
  if (code.revokedAt) return true;
  await db
    .update(joinCodes)
    .set({ revokedAt: input.now ?? new Date(), updatedAt: input.now ?? new Date() })
    .where(eq(joinCodes.id, code.id));
  return true;
}

export async function setActiveProject(
  db: Database,
  telegramId: bigint,
  projectId: string,
  userId: string,
) {
  const visible = await visibleProjectIds(db, userId);
  if (!visible.includes(projectId)) return false;
  await db
    .insert(botSessions)
    .values({ telegramId, activeProjectId: projectId })
    .onConflictDoUpdate({
      target: botSessions.telegramId,
      set: { activeProjectId: projectId, updatedAt: new Date() },
    });
  return true;
}

export async function getActiveProjectId(db: Database, telegramId: bigint): Promise<string | null> {
  const rows = await db.select().from(botSessions).where(eq(botSessions.telegramId, telegramId));
  return rows[0]?.activeProjectId ?? null;
}

export async function noteChainRelease(
  db: Database,
  input: {
    projectId: string;
    workspaceId: string;
    stageId: string;
    txHash: string;
    amountUsdc: bigint;
    amountNgnKobo: bigint;
  },
) {
  await recordPayment(db, {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    stageId: input.stageId,
    kind: "release",
    amountUsdc: input.amountUsdc,
    amountNgnKobo: input.amountNgnKobo,
    idempotencyKey: `release:${input.txHash}:${input.stageId}`,
    txHash: input.txHash,
    status: "confirmed",
  });
}

export async function rememberEscrowSnapshot(
  db: Database,
  project: { id: string; workspaceId: string },
  statuses: { index: number; status: string }[],
  releases: { index: number; txHash: string; payout: bigint }[],
) {
  void statuses;
  const stageRows = await db.select().from(stages).where(eq(stages.projectId, project.id));
  for (const log of releases) {
    const stage = stageRows.find((row) => row.stageIndex === log.index);
    if (!stage) continue;
    await noteChainRelease(db, {
      projectId: project.id,
      workspaceId: project.workspaceId,
      stageId: stage.id,
      txHash: log.txHash,
      amountUsdc: log.payout,
      amountNgnKobo: stage.amountNgnKobo,
    });
  }
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
    return {
      address: party.walletAddress,
      walletId: party.cdpWalletId,
      mock: party.walletMock,
      created: false,
    };
  }
  const wallet = await create();
  const updated = await db
    .update(parties)
    .set({
      walletAddress: wallet.address,
      cdpWalletId: wallet.walletId,
      walletMock: wallet.mock,
      updatedAt: new Date(),
    })
    .where(and(eq(parties.id, partyId), sql`${parties.walletAddress} is null`))
    .returning();
  if (updated[0]) return { ...wallet, created: true };
  const again = await db.select().from(parties).where(eq(parties.id, partyId));
  const row = again[0];
  if (!row?.walletAddress || !row.cdpWalletId) throw new Error("wallet missing after race");
  return {
    address: row.walletAddress,
    walletId: row.cdpWalletId,
    mock: row.walletMock,
    created: false,
  };
}

export type UploadedStage = {
  name: string;
  description: string;
  amountKobo?: string;
  percentBps?: number;
};

export type UploadedContract = {
  parties: { role: string; name: string }[];
  contractSumKobo: string;
  stages: UploadedStage[];
  retentionBps: number;
  defectsPeriodDays: number;
  mobilisationBps: number;
  deadlines: string[];
  paymentTerms: string;
  liquidatedDamages: string;
  ambiguities: string[];
};

function stageAmountKobo(stage: UploadedStage, sumKobo: bigint): bigint {
  if (stage.amountKobo && stage.amountKobo !== "0") return BigInt(stage.amountKobo);
  if (stage.percentBps) return (sumKobo * BigInt(stage.percentBps)) / 10_000n;
  return 0n;
}

export async function recordUploadedContract(
  db: Database,
  input: {
    telegramId: bigint;
    senderName: string;
    site: string;
    filename: string;
    sha256: string;
    bytesBase64: string;
    summary: UploadedContract;
    koboPerUsdc: bigint;
    fxAsOf: string;
    clientAccepted?: boolean;
  },
) {
  const user = await upsertTelegramUser(db, input.telegramId, input.senderName);
  const owned = await db.select().from(workspaces).where(eq(workspaces.ownerUserId, user.id));
  let workspace = owned[0];
  if (!workspace) {
    const clientName =
      input.summary.parties.find((party) => /client|employer/i.test(party.role))?.name ||
      input.senderName;
    const [created] = await db
      .insert(workspaces)
      .values({ ownerUserId: user.id, name: clientName, company: clientName })
      .returning();
    if (!created) throw new Error("workspace insert failed");
    workspace = created;
  }
  const member = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, user.id)),
    );
  if (!member[0]) {
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: workspace.id, userId: user.id, role: "owner" });
  }

  const clientName =
    input.summary.parties.find((party) => /client|employer/i.test(party.role))?.name ||
    input.senderName;
  const sumKobo = BigInt(input.summary.contractSumKobo);
  const sumUsdc = usdcFromNgnKobo(sumKobo, input.koboPerUsdc);
  const projectName = `${clientName} — ${input.site}`.slice(0, 180);
  const summaryJson = { ...input.summary, site: input.site };
  const [project] = await db
    .insert(projects)
    .values({
      workspaceId: workspace.id,
      name: projectName,
      siteLocation: input.site.slice(0, 240),
      siteLat: 0,
      siteLng: 0,
      geofenceRadiusM: 0,
      status: "draft",
      fxRateLocked: input.koboPerUsdc,
      fxSource: `Central Bank of Nigeria ${input.fxAsOf}`,
      fxLockedAt: new Date(),
      spendingCapUsdc: 0n,
      retentionBps: input.summary.retentionBps,
      defectsPeriodDays: input.summary.defectsPeriodDays,
      mobilisationBps: input.summary.mobilisationBps,
      contractSumKobo: sumKobo,
      contractSumUsdc: sumUsdc,
      termsHash: sha256Hex(JSON.stringify(summaryJson)),
    })
    .returning();
  if (!project) throw new Error("project insert failed");

  await db.insert(stages).values(
    input.summary.stages.map((stage, index) => {
      const amountKobo = stageAmountKobo(stage, sumKobo);
      return {
        projectId: project.id,
        workspaceId: workspace.id,
        stageIndex: index,
        name: stage.name,
        description: stage.description,
        amountNgnKobo: amountKobo,
        amountUsdc: usdcFromNgnKobo(amountKobo, input.koboPerUsdc),
        retentionBps: input.summary.retentionBps,
        status: "not_started",
        funded: false,
        onChainIdx: index,
      };
    }),
  );

  const [party] = await db
    .insert(parties)
    .values({ projectId: project.id, workspaceId: workspace.id, userId: user.id, role: "client" })
    .returning();
  if (!party) throw new Error("party insert failed");
  await db
    .insert(memberships)
    .values({ projectId: project.id, userId: user.id, role: "client" })
    .onConflictDoNothing();

  const storageKey = `contracts/${input.sha256}`;
  await db
    .insert(blobs)
    .values({ storageKey, bytes: input.bytesBase64, contentType: "application/octet-stream" })
    .onConflictDoNothing();
  await db.insert(documents).values({
    projectId: project.id,
    workspaceId: workspace.id,
    kind: "contract",
    storageKey,
    sha256: input.sha256,
    parsedJson: summaryJson,
    parseStatus: "parsed",
  });
  await db.insert(contractSummaries).values({
    projectId: project.id,
    workspaceId: workspace.id,
    version: 1,
    json: summaryJson,
    hash: project.termsHash ?? input.sha256,
    acceptedByClientAt: input.clientAccepted ? new Date() : null,
  });
  if (sumKobo > 0n && input.koboPerUsdc > 0n) {
    const [version] = await db
      .insert(contractVersions)
      .values({
        projectId: project.id,
        version: 1,
        status: input.clientAccepted ? "pending_acceptance" : "draft",
        contractSumKobo: sumKobo,
        retentionBps: input.summary.retentionBps,
        defectsPeriodDays: input.summary.defectsPeriodDays,
        koboPerUsdc: input.koboPerUsdc,
        fxSource: "cbn",
        fxAsOf: input.fxAsOf.slice(0, 10),
        spendingCapMicro: 1n,
        terms: summaryJson,
        documentHashes: [input.sha256],
        contentHash: project.termsHash ?? input.sha256,
        createdBy: user.id,
      })
      .returning();
    if (version && input.clientAccepted) {
      await db.insert(contractAcceptances).values({
        contractVersionId: version.id,
        userId: user.id,
        role: "client",
        decision: "accepted",
        contentHash: version.contentHash,
      });
    }
  }

  const { code } = await issueJoinCode(db, {
    projectId: project.id,
    workspaceId: workspace.id,
    role: "main_contractor",
  });
  await db
    .insert(botSessions)
    .values({ telegramId: input.telegramId, activeProjectId: project.id })
    .onConflictDoUpdate({
      target: botSessions.telegramId,
      set: { activeProjectId: project.id, updatedAt: new Date() },
    });

  return {
    projectId: project.id,
    projectName,
    stageCount: input.summary.stages.length,
    contractorCode: code,
    partyId: party.id,
  };
}

export async function acceptContractSide(
  db: Database,
  input: { projectId: string; side: "client" | "contractor" },
) {
  const rows = await db
    .select()
    .from(contractSummaries)
    .where(eq(contractSummaries.projectId, input.projectId));
  const summary = rows.sort((a, b) => b.version - a.version)[0];
  if (!summary) return { ok: false as const, reason: "No schedule is saved for this project." };
  const now = new Date();
  const otherAccepted =
    input.side === "client" ? summary.acceptedByContractorAt : summary.acceptedByClientAt;
  try {
    if (input.side === "client") {
      await db
        .update(contractSummaries)
        .set({ acceptedByClientAt: now, updatedAt: now })
        .where(eq(contractSummaries.id, summary.id));
    } else {
      await db
        .update(contractSummaries)
        .set({ acceptedByContractorAt: now, updatedAt: now })
        .where(eq(contractSummaries.id, summary.id));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("locked") || message.includes("already recorded")) {
      return { ok: false as const, reason: "This version is already accepted." };
    }
    throw error;
  }
  if (otherAccepted) {
    const versions = await db
      .select()
      .from(contractVersions)
      .where(eq(contractVersions.projectId, input.projectId));
    const version = versions.sort((a, b) => b.version - a.version)[0];
    if (version?.status === "pending_acceptance") {
      await db
        .update(contractVersions)
        .set({ status: "accepted" })
        .where(eq(contractVersions.id, version.id));
    }
  }
  return { ok: true as const, both: Boolean(otherAccepted) };
}

export const ANONYMOUS_FUND_ID = "7786f304-faf8-45e7-9aab-6b4df6882c8e";

export async function deleteAnonymousFund(
  db: Database,
): Promise<{ id: string; deleted: boolean; note: string }> {
  const rows = await db.select().from(payments).where(eq(payments.id, ANONYMOUS_FUND_ID));
  const row = rows[0];
  if (!row) {
    const note = `anonymous fund ${ANONYMOUS_FUND_ID} was not in this database`;
    console.info(note);
    return { id: ANONYMOUS_FUND_ID, deleted: false, note };
  }
  await db.delete(payments).where(eq(payments.id, ANONYMOUS_FUND_ID));
  const note = `deleted anonymous fund ${ANONYMOUS_FUND_ID} status=${row.status} usdc=${row.amountUsdc.toString()} key=${row.idempotencyKey}`;
  console.info(note);
  return { id: ANONYMOUS_FUND_ID, deleted: true, note };
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
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.idempotencyKey, input.idempotencyKey));
  const payment = rows[0];
  if (!payment) throw new Error("payment missing");
  return { payment, created: false };
}

export async function appendAudit(
  db: Database,
  input: {
    workspaceId?: string;
    actorUserId?: string;
    action: string;
    entity: string;
    entityId?: string;
    payload: string;
    actorKind?: string;
    projectId?: string;
    reason?: string;
  },
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
      actorKind: input.actorKind ?? "user",
      projectId: input.projectId,
      reason: input.reason,
    })
    .returning();
  return row;
}

export function encryptEmail(email: string): string {
  return encryptString(email.trim().toLowerCase());
}
