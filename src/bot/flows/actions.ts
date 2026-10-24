import { randomUUID } from "node:crypto";
import {
  approvals,
  changeRequests,
  contractVersions,
  documents,
  disputes,
  jobs,
  issueJoinCode,
  memberships,
  parties,
  payments,
  stages,
  type Database,
} from "@certa/db";
import { koboFromUsdc, usdcFromNgnKobo } from "@certa/shared";
import { and, eq } from "drizzle-orm";
import { parseNaira, formatNaira } from "../../lib/money/kobo.js";
import { InvalidMoney } from "../../lib/money/kobo.js";
import { acceptPlan, enqueueExtraction } from "../../server/intake/flow.js";
import { enqueueJob } from "../../server/jobs/enqueue.js";
import { transitionStage } from "../../server/stages/transition.js";
import { enqueuePrePour } from "../../server/x402/prepour.js";
import { stageNeedsWeather } from "../../server/x402/gate.js";
import { enqueueReleaseRetry } from "../releaseRetry.js";
import { formatWatDate } from "../dates.js";
import { escapeHtml } from "../html.js";
import {
  acceptPlanKeyboard,
  approveKeyboard,
  cameraKeyboard,
  cancelKeyboard,
  certifyKeyboard,
  disputeDecideKeyboard,
  editPlanKeyboard,
  fundKeyboard,
  inviteRoleKeyboard,
  inviteShareKeyboard,
  manualStagesKeyboard,
  retryPhotosKeyboard,
  photoListKeyboard,
  readingKeyboard,
  uploadDoneKeyboard,
  variationReplyKeyboard,
  variationSendKeyboard,
  variationStageKeyboard,
  walletKeyboard,
} from "../keyboards.js";
import {
  bAc1,
  bAc2,
  bAc3,
  bAc5,
  bAc6,
  bIn8,
  bAp1,
  bAp2,
  bAp3,
  bAp4,
  bAp5,
  bAp6,
  bAp8,
  bCf1,
  bDi1,
  bDi1Opened,
  bDi1Photos,
  bDi2,
  bDi4,
  bDi5,
  bEx3,
  bFu1,
  bGe1,
  bGe4,
  bIn1,
  bIn2,
  bPh1,
  bPh2,
  bRv1,
  bRv2,
  bRv3,
  bSt6,
  bUp1,
  bUp2,
  bUp8,
  bVa1,
  bVa1Amount,
  bVa1Stage,
  bVa1Summary,
  bVa2,
  bVa3,
  bVa4,
  bVa5,
  bWa1,
  bWa2,
  bullets,
  paymentLine,
} from "../messages.js";
import { notify } from "../notify.js";
import { writeSession } from "../state.js";
import { watStamp } from "../../server/intake/messages.js";
import {
  appUrl,
  forbid,
  memberUsers,
  partyRows,
  replace,
  roleLabel,
  say,
  type Actor,
  type EngineDeps,
  type Outbound,
} from "./common.js";

function naira(kobo: bigint): string {
  return formatNaira(kobo);
}

function retentionKobo(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / 10000n;
}

export async function beginUpload(db: Database, actor: Actor, now: Date): Promise<Outbound> {
  const denied = forbid(actor, ["client", "consultant"], "client");
  if (denied || !actor.project) return denied ?? say(bUp8());
  await writeSession(db, actor.telegramId, { step: "upload", projectId: actor.project.id, data: { projectId: actor.project.id } }, now);
  return say(bUp8(), uploadDoneKeyboard());
}

export async function retryDocuments(db: Database, actor: Actor): Promise<Outbound> {
  if (!actor.project) return say(bUp2());
  const files = await db.select().from(documents).where(eq(documents.projectId, actor.project.id));
  for (const file of files) {
    if (file.status === "parsed" && file.parseStatus === "parsed") continue;
    await db.update(documents).set({ status: "uploaded", parseStatus: "pending", failureCode: null }).where(eq(documents.id, file.id));
    const dedupeKey = `parse:${file.id}`;
    const existing = (await db.select().from(jobs).where(eq(jobs.dedupeKey, dedupeKey)))[0];
    if (existing && existing.status !== "running") {
      await db.update(jobs).set({ status: "queued", attempts: 0, lastError: null, runAt: new Date(), updatedAt: new Date() }).where(eq(jobs.id, existing.id));
    } else if (!existing) {
      await enqueueJob(db, { kind: "parse_document", payload: { documentId: file.id }, dedupeKey });
    }
  }
  await enqueueExtraction(db, actor.project.id);
  return say(bUp2(), readingKeyboard());
}

export async function finishUpload(db: Database, actor: Actor, now: Date): Promise<Outbound> {
  const denied = forbid(actor, ["client", "consultant"], "client");
  if (denied || !actor.project) return denied ?? say(bUp2());
  await enqueueExtraction(db, actor.project.id);
  await writeSession(db, actor.telegramId, { step: null, projectId: actor.project.id }, now);
  return say(bUp2(), readingKeyboard());
}

export async function takeDocument(db: Database, actor: Actor, fileName: string, bytes: Uint8Array, deps: EngineDeps): Promise<Outbound> {
  if (!actor.project || actor.session.step !== "upload") return { messages: [] };
  const saved = deps.ingest
    ? await deps.ingest({ projectId: actor.project.id, workspaceId: actor.project.workspaceId, userId: actor.userId, fileName, bytes })
    : { ok: false as const, message: bEx3() };
  if (!saved.ok) return say(saved.message);
  return say(bUp1({ fileName, pagesOrSheets: saved.pagesOrSheets }), uploadDoneKeyboard());
}

export function beginInvite(actor: Actor): Outbound {
  const denied = forbid(actor, ["client"], "client");
  if (denied) return denied;
  return say(bIn1(), inviteRoleKeyboard());
}

export async function issueInvite(db: Database, actor: Actor, role: string, now: Date, deps: EngineDeps): Promise<Outbound> {
  const denied = forbid(actor, ["client"], "client");
  if (denied || !actor.project) return denied ?? say(bIn1(), inviteRoleKeyboard());
  if (role !== "contractor" && role !== "subcontractor" && role !== "consultant") return say(bIn1(), inviteRoleKeyboard());
  const filled = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.projectId, actor.project.id), eq(memberships.role, role), eq(memberships.status, "active")));
  if (filled.length > 0) return say(bIn8());
  const partyRole = role === "contractor" ? "main_contractor" : role;
  const issued = await issueJoinCode(db, { projectId: actor.project.id, workspaceId: actor.project.workspaceId, role: partyRole });
  const link = `https://t.me/${botName(deps)}?start=join_${issued.code}`;
  const label = roleLabel(role);
  return say(bIn2({ roleLabel: label, date: formatWatDate(issued.expiresAt), link }), inviteShareKeyboard(link));
}

function botName(deps: EngineDeps): string {
  return (deps.botUsername || process.env.TELEGRAM_BOT_USERNAME || process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "CertaApp_bot").replace(/^@/, "");
}

export async function showPlan(db: Database, actor: Actor, deps: EngineDeps): Promise<Outbound> {
  if (!actor.project) return say(bGe4());
  const version = (await db.select().from(contractVersions).where(eq(contractVersions.projectId, actor.project.id)))[0];
  if (!version) return say(bEx3(), manualStagesKeyboard(appUrl(deps), actor.project.id));
  const stageRows = (await db.select().from(stages).where(eq(stages.projectId, actor.project.id))).sort((a, b) => a.stageIndex - b.stageIndex);
  const lines = stageRows.map((stage) => `${stage.stageIndex + 1}. ${escapeHtml(stage.name)} \u2014 ${naira(stage.amountNgnKobo)}`).join("\n");
  const client = (await memberUsers(db, actor.project.id, "client"))[0];
  return say(
    bAc1({
      clientName: client?.name ?? "The client",
      project: actor.project.name,
      sum: naira(version.contractSumKobo),
      stageLines: lines,
      retentionPct: String(version.retentionBps / 100),
      months: Math.max(1, Math.round(version.defectsPeriodDays / 30)),
    }),
    acceptPlanKeyboard(appUrl(deps), version.id),
  );
}

export async function acceptOrChange(db: Database, actor: Actor, versionId: string, arg: string, now: Date, _deps: EngineDeps): Promise<Outbound> {
  if (!actor.project) return replace(bGe4());
  if (arg === "change") {
    const denied = forbid(actor, ["contractor"], "contractor");
    if (denied) return denied;
    await writeSession(db, actor.telegramId, { step: "change_reason", projectId: actor.project.id, data: { versionId } }, now);
    return replace(bAc5());
  }
  if (actor.role !== "client" && actor.role !== "contractor") {
    return replace(bGe1({ requiredRole: "contractor", project: actor.project.name }));
  }
  let result: Awaited<ReturnType<typeof acceptPlan>>;
  try {
    result = await acceptPlan(db, {
      projectId: actor.project.id,
      userId: actor.userId,
      role: actor.role === "client" ? "client" : "contractor",
      decision: "accepted",
    });
  } catch {
    return replace(bGe4());
  }
  if (!result.ok) return replace(result.message);
  if (!result.both) return replace(bAc6());
  const clients = await memberUsers(db, actor.project.id, "client");
  return replace(bAc3({ dateTimeWat: watStamp(now), clientName: clients[0]?.name ?? "The client" }));
}

export async function onChangeReason(db: Database, actor: Actor, text: string, now: Date, deps: EngineDeps): Promise<Outbound> {
  const reason = text.trim();
  if (reason.length < 10) return say(bAc5());
  if (!actor.project || actor.role !== "contractor") return say(bGe4());
  let result: Awaited<ReturnType<typeof acceptPlan>>;
  try {
    result = await acceptPlan(db, {
      projectId: actor.project.id,
      userId: actor.userId,
      role: "contractor",
      decision: "change_requested",
      reason,
    });
  } catch {
    return say(bGe4());
  }
  await writeSession(db, actor.telegramId, { step: null, projectId: actor.project.id }, now);
  if (!result.ok) return say(result.message);
  const clients = await memberUsers(db, actor.project.id, "client");
  const note = bAc2({ contractorName: actor.firstName, reason });
  for (const client of clients) {
    await notify(db, { userId: client.id, messageId: "B-AC-2", text: note, dedupeKey: `bac2:${actor.session.data.versionId}:${client.id}`, chatId: client.telegramId.toString() });
  }
  return say(note, editPlanKeyboard(appUrl(deps), actor.project.id));
}

export function fund(actor: Actor, deps: EngineDeps): Outbound {
  const denied = forbid(actor, ["client"], "client");
  if (denied || !actor.project) return denied ?? say(bFu1({ project: "this project" }));
  return say(bFu1({ project: actor.project.name }), fundKeyboard(appUrl(deps), actor.project.id));
}

const PHOTO_OPEN = new Set(["not_started", "in_progress", "ai_fail", "needs_more_evidence"]);

export async function photos(db: Database, actor: Actor): Promise<Outbound> {
  const denied = forbid(actor, ["contractor", "subcontractor"], "contractor");
  if (denied || !actor.project) return denied ?? say(bPh1());
  const rows = (await db.select().from(stages).where(eq(stages.projectId, actor.project.id)))
    .filter((stage) => PHOTO_OPEN.has(stage.status))
    .sort((a, b) => a.stageIndex - b.stageIndex);
  if (rows.length === 0) return say(bPh1());
  return say(
    bPh1(),
    photoListKeyboard(
      rows.map((stage) => ({
        id: stage.id,
        label: `${stage.stageIndex + 1}. ${stage.name}`.slice(0, 40),
        weather: stageNeedsWeather(stage),
      })),
    ),
  );
}

export async function planPour(db: Database, actor: Actor, stageId: string): Promise<Outbound> {
  const denied = forbid(actor, ["contractor", "subcontractor"], "contractor");
  if (denied || !actor.project) return denied ?? replace(bGe4());
  const stage = (await db.select().from(stages).where(eq(stages.id, stageId)))[0];
  if (!stage || stage.projectId !== actor.project.id || !stageNeedsWeather(stage)) return replace(bGe4());
  await enqueuePrePour(db, { projectId: actor.project.id, stageId: stage.id });
  return replace(`Certa is checking the weather before the ${stage.name} pour. You'll get the result here.`);
}

export async function photoStage(db: Database, actor: Actor, stageId: string, deps: EngineDeps): Promise<Outbound> {
  const denied = forbid(actor, ["contractor", "subcontractor"], "contractor");
  if (denied || !actor.project) return denied ?? replace(bGe4());
  const stage = (await db.select().from(stages).where(eq(stages.id, stageId)))[0];
  if (!stage || stage.projectId !== actor.project.id) return replace(bGe4());
  const criteria = stage.acceptanceCriteria.length > 0 ? stage.acceptanceCriteria : ["the work in this stage"];
  return say(bPh2({ stage: stage.name, criteriaBullets: bullets(criteria) }), cameraKeyboard(appUrl(deps), stage.id));
}

export async function myStages(db: Database, actor: Actor): Promise<Outbound> {
  if (!actor.project) return say(bSt6({ project: "this project", lines: "" }));
  const rows = (await db.select().from(stages).where(eq(stages.projectId, actor.project.id))).sort((a, b) => a.stageIndex - b.stageIndex);
  const lines = rows.map((stage) => `${stage.stageIndex + 1}. ${escapeHtml(stage.name)}`).join("\n");
  return say(bSt6({ project: actor.project.name, lines }));
}

export async function reviewQueue(db: Database, actor: Actor, deps: EngineDeps): Promise<Outbound> {
  const denied = forbid(actor, ["client", "consultant"], "consultant");
  if (denied || !actor.project) return denied ?? say(bRv3({ project: "this project" }));
  const rows = await db.select().from(stages).where(eq(stages.projectId, actor.project.id));
  const waiting = rows.filter((stage) =>
    actor.role === "consultant" ? stage.status === "awaiting_certification" || stage.status === "needs_more_evidence" : stage.status === "awaiting_client_approval",
  );
  if (waiting.length === 0 || !waiting[0]) return say(bRv3({ project: actor.project.name }));
  const stage = waiting[0];
  if (actor.role === "client") return approvalPrompt(db, actor, stage.id, deps);
  return say(bCf1({ n: stage.stageIndex + 1 }), certifyKeyboard(appUrl(deps), stage.id));
}

export async function certify(db: Database, actor: Actor, stageId: string, _deps: EngineDeps): Promise<Outbound> {
  const denied = forbid(actor, ["consultant"], "consultant");
  if (denied || !actor.project) return denied ? replace(denied.messages[0]?.text ?? bGe4()) : replace(bGe4());
  const stage = (await db.select().from(stages).where(eq(stages.id, stageId)))[0];
  if (!stage || stage.projectId !== actor.project.id || stage.status !== "awaiting_certification") return replace(bGe4());
  await transitionStage(db, stage.id, "awaiting_client_approval");
  await db.insert(approvals).values({
    projectId: actor.project.id,
    workspaceId: actor.project.workspaceId,
    stageId: stage.id,
    byUserId: actor.userId,
    decision: "certified",
  });
  const clients = await memberUsers(db, actor.project.id, "client");
  const contractors = await memberUsers(db, actor.project.id, "contractor");
  const above = stage.amountUsdc > actor.project.spendingCapUsdc;
  const prompt = above
    ? bAp2({
        n: stage.stageIndex + 1,
        stage: stage.name,
        consultant: actor.firstName,
        amount: naira(stage.amountNgnKobo),
        cap: capNaira(actor.project),
        contractor: contractors[0]?.name ?? "the contractor",
      })
    : bAp1({
        n: stage.stageIndex + 1,
        stage: stage.name,
        consultant: actor.firstName,
        amount: naira(stage.amountNgnKobo),
        retention: naira(retentionKobo(stage.amountNgnKobo, stage.retentionBps)),
        contractor: contractors[0]?.name ?? "the contractor",
      });
  for (const client of clients) {
    await notify(db, {
      userId: client.id,
      messageId: above ? "B-AP-2" : "B-AP-1",
      text: prompt,
      dedupeKey: `bap:${stage.id}:${client.id}`,
      chatId: client.telegramId.toString(),
    });
  }
  return replace(bCf1({ n: stage.stageIndex + 1 }));
}

function capNaira(project: { spendingCapUsdc: bigint; fxRateLocked: bigint }): string {
  if (project.fxRateLocked <= 0n) return naira(0n);
  return naira(koboFromUsdc(project.spendingCapUsdc, project.fxRateLocked));
}

export async function rejectAsk(db: Database, actor: Actor, stageId: string, now: Date): Promise<Outbound> {
  const denied = forbid(actor, ["consultant"], "consultant");
  if (denied || !actor.project) return denied ? replace(denied.messages[0]?.text ?? bGe4()) : replace(bGe4());
  const stage = (await db.select().from(stages).where(eq(stages.id, stageId)))[0];
  if (!stage || stage.projectId !== actor.project.id) return replace(bGe4());
  await writeSession(db, actor.telegramId, { step: "reject_reason", projectId: actor.project.id, data: { stageId } }, now);
  return replace(bRv1({ n: stage.stageIndex + 1 }));
}

export async function onRejectReason(db: Database, actor: Actor, text: string, now: Date): Promise<Outbound> {
  const reason = text.trim();
  const stageId = actor.session.data.stageId ?? "";
  const stage = stageId ? (await db.select().from(stages).where(eq(stages.id, stageId)))[0] : undefined;
  if (!stage) return say(bGe4());
  if (reason.length < 10) return say(bRv1({ n: stage.stageIndex + 1 }));
  if (stage.status === "awaiting_certification") await transitionStage(db, stage.id, "in_progress");
  await db.insert(approvals).values({
    projectId: stage.projectId,
    workspaceId: stage.workspaceId,
    stageId: stage.id,
    byUserId: actor.userId,
    decision: "rejected",
    reason,
  });
  const note = bRv2({ n: stage.stageIndex + 1, consultant: actor.firstName, reason });
  const contractors = [
    ...(await memberUsers(db, stage.projectId, "contractor")),
    ...(await memberUsers(db, stage.projectId, "subcontractor")),
  ];
  for (const person of contractors) {
    await notify(db, { userId: person.id, messageId: "B-RV-2", text: note, dedupeKey: `brv2:${stage.id}:${person.id}:${reason.slice(0, 12)}`, chatId: person.telegramId.toString() });
  }
  await writeSession(db, actor.telegramId, { step: null, projectId: stage.projectId }, now);
  return say(note, retryPhotosKeyboard(stage.id));
}

export async function approvalPrompt(db: Database, actor: Actor, stageId: string, deps: EngineDeps): Promise<Outbound> {
  const denied = forbid(actor, ["client"], "client");
  if (denied || !actor.project) return denied ?? replace(bGe4());
  const stage = (await db.select().from(stages).where(eq(stages.id, stageId)))[0];
  if (!stage || stage.projectId !== actor.project.id) return replace(bGe4());
  const consultants = await memberUsers(db, actor.project.id, "consultant");
  const contractors = await memberUsers(db, actor.project.id, "contractor");
  const above = stage.amountUsdc > actor.project.spendingCapUsdc;
  const text = above
    ? bAp2({
        n: stage.stageIndex + 1,
        stage: stage.name,
        consultant: consultants[0]?.name ?? "the consultant",
        amount: naira(stage.amountNgnKobo),
        cap: capNaira(actor.project),
        contractor: contractors[0]?.name ?? "the contractor",
      })
    : bAp1({
        n: stage.stageIndex + 1,
        stage: stage.name,
        consultant: consultants[0]?.name ?? "the consultant",
        amount: naira(stage.amountNgnKobo),
        retention: naira(retentionKobo(stage.amountNgnKobo, stage.retentionBps)),
        contractor: contractors[0]?.name ?? "the contractor",
      });
  return say(text, approveKeyboard(appUrl(deps), stage.id));
}

export async function approve(db: Database, actor: Actor, stageId: string, deps: EngineDeps): Promise<Outbound> {
  const denied = forbid(actor, ["client"], "client");
  if (denied || !actor.project) return replace(denied?.messages[0]?.text ?? bGe4());
  const stage = (await db.select().from(stages).where(eq(stages.id, stageId)))[0];
  if (!stage || stage.projectId !== actor.project.id) return replace(bGe4());
  const key = `bot-approve:${stage.id}`;
  const existing = (await db.select().from(payments).where(eq(payments.idempotencyKey, key)))[0];
  const contractors = await memberUsers(db, actor.project.id, "contractor");
  const contractorName = contractors[0]?.name ?? "the contractor";
  if (existing?.status === "confirmed") {
    return replace(bAp4({ amount: naira(stage.amountNgnKobo), contractor: contractorName, n: stage.stageIndex + 1, stage: stage.name, explorerLink: existing.txHash ?? "" }));
  }
  if (existing) return replace(bAp3({ amount: naira(stage.amountNgnKobo), n: stage.stageIndex + 1 }));
  if (stage.status !== "awaiting_client_approval" && stage.status !== "approved") return replace(bGe4());
  const approvalId = randomUUID();
  await db.insert(approvals).values({
    id: approvalId,
    projectId: actor.project.id,
    workspaceId: actor.project.workspaceId,
    stageId: stage.id,
    byUserId: actor.userId,
    decision: "approved",
  });
  const inserted = await db
    .insert(payments)
    .values({
      stageId: stage.id,
      projectId: actor.project.id,
      workspaceId: actor.project.workspaceId,
      kind: "release",
      amountUsdc: stage.amountUsdc,
      amountNgnKobo: stage.amountNgnKobo,
      status: "pending",
      idempotencyKey: key,
    })
    .onConflictDoNothing({ target: payments.idempotencyKey })
    .returning();
  if (!inserted[0]) return replace(bAp3({ amount: naira(stage.amountNgnKobo), n: stage.stageIndex + 1 }));
  const released = deps.release
    ? await deps.release({
        projectId: actor.project.id,
        stageId: stage.id,
        approvalId,
        stageIndex: stage.onChainIdx,
        amountMicro: stage.amountUsdc,
        capMicro: actor.project.spendingCapUsdc,
      })
    : { ok: false as const, reason: "The payment service is not configured." };
  if (!released.ok) {
    await db.update(payments).set({ status: "failed" }).where(eq(payments.id, inserted[0].id));
    await enqueueReleaseRetry(db, {
      idempotencyKey: key,
      projectId: actor.project.id,
      stageId: stage.id,
      approvalId,
      stageIndex: stage.onChainIdx,
      amountMicro: stage.amountUsdc,
      capMicro: actor.project.spendingCapUsdc,
    });
    return replace(bAp6({ n: stage.stageIndex + 1 }));
  }
  await db.update(payments).set({ status: "confirmed", txHash: released.explorerLink }).where(eq(payments.id, inserted[0].id));
  if (stage.status === "awaiting_client_approval") {
    await transitionStage(db, stage.id, "approved").catch(() => undefined);
  }
  const paid = bAp4({
    amount: naira(stage.amountNgnKobo),
    contractor: contractorName,
    n: stage.stageIndex + 1,
    stage: stage.name,
    explorerLink: released.explorerLink,
  });
  const everyone = [
    ...(await memberUsers(db, actor.project.id, "contractor")),
    ...(await memberUsers(db, actor.project.id, "consultant")),
    ...(await memberUsers(db, actor.project.id, "subcontractor")),
  ];
  for (const person of everyone) {
    await notify(db, { userId: person.id, messageId: "B-AP-4", text: paid, dedupeKey: `bap4:${stage.id}:${person.id}`, chatId: person.telegramId.toString() });
  }
  return replace(paid);
}

export async function declineAsk(db: Database, actor: Actor, stageId: string, now: Date): Promise<Outbound> {
  const denied = forbid(actor, ["client"], "client");
  if (denied || !actor.project) return replace(denied?.messages[0]?.text ?? bGe4());
  const stage = (await db.select().from(stages).where(eq(stages.id, stageId)))[0];
  if (!stage || stage.projectId !== actor.project.id) return replace(bGe4());
  await writeSession(db, actor.telegramId, { step: "decline_reason", projectId: actor.project.id, data: { stageId } }, now);
  return replace(bAp5({ n: stage.stageIndex + 1 }));
}

export async function onDeclineReason(db: Database, actor: Actor, text: string, now: Date): Promise<Outbound> {
  const reason = text.trim();
  const stage = actor.session.data.stageId ? (await db.select().from(stages).where(eq(stages.id, actor.session.data.stageId)))[0] : undefined;
  if (!stage) return say(bGe4());
  if (reason.length < 10) return say(bAp5({ n: stage.stageIndex + 1 }));
  if (stage.status === "awaiting_client_approval") await transitionStage(db, stage.id, "in_progress");
  const note = bAp8({ n: stage.stageIndex + 1, client: actor.firstName, reason });
  const people = [...(await memberUsers(db, stage.projectId, "contractor")), ...(await memberUsers(db, stage.projectId, "consultant"))];
  for (const person of people) {
    await notify(db, { userId: person.id, messageId: "B-AP-8", text: note, dedupeKey: `bap8:${stage.id}:${person.id}`, chatId: person.telegramId.toString() });
  }
  await writeSession(db, actor.telegramId, { step: null, projectId: stage.projectId }, now);
  return say(note);
}

export async function beginDispute(db: Database, actor: Actor, stageId: string, now: Date): Promise<Outbound> {
  const denied = forbid(actor, ["client", "contractor"], "client");
  if (denied || !actor.project) return denied ?? say(bDi1({ n: 0 }));
  const stage = (await db.select().from(stages).where(eq(stages.id, stageId)))[0];
  if (!stage || stage.projectId !== actor.project.id) return say(bGe4());
  await writeSession(db, actor.telegramId, { step: "dispute_reason", projectId: actor.project.id, data: { stageId } }, now);
  return say(bDi1({ n: stage.stageIndex + 1 }));
}

export async function onDisputeReason(db: Database, actor: Actor, text: string, now: Date): Promise<Outbound> {
  const reason = text.trim();
  const stage = actor.session.data.stageId ? (await db.select().from(stages).where(eq(stages.id, actor.session.data.stageId)))[0] : undefined;
  if (!stage || !actor.project) return say(bGe4());
  if (reason.length < 10) return say(bDi1({ n: stage.stageIndex + 1 }));
  await writeSession(db, actor.telegramId, { step: "dispute_photos", projectId: actor.project.id, data: { stageId: stage.id, reason } }, now);
  return say(bDi1Photos(), cancelKeyboard());
}

export async function finishDispute(db: Database, actor: Actor, now: Date): Promise<Outbound> {
  const stageId = actor.session.data.stageId ?? "";
  const reason = actor.session.data.reason ?? "";
  const stage = stageId ? (await db.select().from(stages).where(eq(stages.id, stageId)))[0] : undefined;
  if (!stage || !actor.project || !actor.role) return say(bGe4());
  const deadline = new Date(now.getTime() + actor.project.disputeTimeoutDays * 24 * 60 * 60 * 1000);
  const [opened] = await db
    .insert(disputes)
    .values({
      stageId: stage.id,
      projectId: actor.project.id,
      workspaceId: actor.project.workspaceId,
      raisedBy: actor.userId,
      reason,
      status: "open",
      deadlineAt: deadline,
    })
    .returning();
  if (stage.status === "in_progress" || stage.status === "awaiting_client_approval" || stage.status === "awaiting_certification" || stage.status === "submitted") {
    await transitionStage(db, stage.id, "disputed").catch(() => undefined);
  }
  const consultants = await memberUsers(db, actor.project.id, "consultant");
  const otherRole = actor.role === "client" ? "contractor" : "client";
  const others = await memberUsers(db, actor.project.id, otherRole);
  const consultantName = consultants[0]?.name ?? "the consultant";
  const otherName = others[0]?.name ?? "the other party";
  const note = bDi1Opened({ otherParty: otherName, consultant: consultantName, decideAfterDate: formatWatDate(deadline) });
  for (const person of [...others, ...consultants]) {
    await notify(db, { userId: person.id, messageId: "B-DI-1", text: note, dedupeKey: `bdi1:${opened?.id ?? stage.id}:${person.id}`, chatId: person.telegramId.toString() });
  }
  if (consultants[0] && opened) {
    await notify(db, {
      userId: consultants[0].id,
      messageId: "B-DI-2",
      text: bDi2({ n: stage.stageIndex + 1, reason }),
      dedupeKey: `bdi2:${opened.id}:${consultants[0].id}`,
      chatId: consultants[0].telegramId.toString(),
    });
  }
  await writeSession(db, actor.telegramId, { step: null, projectId: actor.project.id }, now);
  return say(note);
}

export async function listDisputes(db: Database, actor: Actor, deps: EngineDeps): Promise<Outbound> {
  const denied = forbid(actor, ["consultant"], "consultant");
  if (denied || !actor.project) return denied ?? say(bDi4({ project: "this project" }));
  const open = (await db.select().from(disputes).where(eq(disputes.projectId, actor.project.id))).filter((row) => row.status === "open");
  const first = open[0];
  if (!first) return say(bDi4({ project: actor.project.name }));
  const stage = (await db.select().from(stages).where(eq(stages.id, first.stageId)))[0];
  return say(bDi2({ n: (stage?.stageIndex ?? 0) + 1, reason: first.reason }), disputeDecideKeyboard(appUrl(deps), first.id));
}

export async function decideDispute(db: Database, actor: Actor, disputeId: string, pay: boolean, deps: EngineDeps): Promise<Outbound> {
  const denied = forbid(actor, ["consultant"], "consultant");
  if (denied || !actor.project) return replace(denied?.messages[0]?.text ?? bGe4());
  const dispute = (await db.select().from(disputes).where(eq(disputes.id, disputeId)))[0];
  if (!dispute || dispute.projectId !== actor.project.id || dispute.status !== "open") return replace(bGe4());
  const stage = (await db.select().from(stages).where(eq(stages.id, dispute.stageId)))[0];
  if (!stage) return replace(bGe4());
  if (!pay) {
    await db.update(disputes).set({ status: "resolved", resolution: { pay: false } }).where(eq(disputes.id, dispute.id));
    if (stage.status === "disputed") await transitionStage(db, stage.id, "in_progress").catch(() => undefined);
    return replace(bDi5({ n: stage.stageIndex + 1 }));
  }
  await db.update(disputes).set({ status: "resolved", resolution: { pay: true } }).where(eq(disputes.id, dispute.id));
  if (stage.status === "disputed") await transitionStage(db, stage.id, "approved").catch(() => undefined);
  return approve(db, { ...actor, role: "client" }, stage.id, deps);
}

export async function beginVariation(db: Database, actor: Actor, now: Date): Promise<Outbound> {
  const denied = forbid(actor, ["client", "contractor"], "contractor");
  if (denied || !actor.project) return denied ?? say(bVa1());
  await writeSession(db, actor.telegramId, { step: "variation_title", projectId: actor.project.id, data: {} }, now);
  return say(bVa1());
}

export async function onVariationTitle(db: Database, actor: Actor, text: string, now: Date): Promise<Outbound> {
  const title = text.trim();
  if (title.length < 3) return say(bVa1());
  await writeSession(db, actor.telegramId, { step: "variation_amount", projectId: actor.project?.id ?? null, data: { title } }, now);
  return say(bVa1Amount());
}

export async function onVariationAmount(db: Database, actor: Actor, text: string, now: Date): Promise<Outbound> {
  let kobo: bigint;
  try {
    kobo = parseNaira(text);
  } catch (error) {
    if (error instanceof InvalidMoney) return say(bVa4());
    throw error;
  }
  if (!actor.project) return say(bVa4());
  const rows = (await db.select().from(stages).where(eq(stages.projectId, actor.project.id))).sort((a, b) => a.stageIndex - b.stageIndex);
  await writeSession(db, actor.telegramId, { step: "variation_stage", projectId: actor.project.id, data: { ...actor.session.data, amount: kobo.toString() } }, now);
  return say(
    bVa1Stage(),
    variationStageKeyboard(rows.map((stage) => ({ id: stage.id, label: `${stage.stageIndex + 1}. ${stage.name}`.slice(0, 40) }))),
  );
}

export async function chooseVariationStage(db: Database, actor: Actor, stageId: string, now: Date): Promise<Outbound> {
  if (!actor.project) return replace(bGe4());
  const amount = BigInt(actor.session.data.amount ?? "0");
  const title = actor.session.data.title ?? "";
  const stageName = stageId === "new" ? "a new stage" : ((await db.select().from(stages).where(eq(stages.id, stageId)))[0]?.name ?? "a stage");
  await writeSession(db, actor.telegramId, {
    step: "variation_confirm",
    projectId: actor.project.id,
    data: { ...actor.session.data, stageId, stageName },
  }, now);
  return replace(bVa1Summary({ title, amount: naira(amount), stage: stageName }), variationSendKeyboard());
}

export async function sendVariation(db: Database, actor: Actor, now: Date): Promise<Outbound> {
  if (!actor.project || !actor.role) return replace(bGe4());
  const title = actor.session.data.title ?? "";
  const amount = BigInt(actor.session.data.amount ?? "0");
  const stageId = actor.session.data.stageId ?? "";
  const [row] = await db
    .insert(changeRequests)
    .values({
      projectId: actor.project.id,
      workspaceId: actor.project.workspaceId,
      type: stageId === "new" ? "add" : "alter",
      beforeJson: {},
      afterJson: { title, amountKobo: amount.toString(), stageId },
      requestedBy: actor.userId,
      status: "pending",
    })
    .returning();
  await writeSession(db, actor.telegramId, { step: null, projectId: actor.project.id }, now);
  if (!row) return replace(bGe4());
  const otherRole = actor.role === "client" ? "contractor" : "client";
  const others = await memberUsers(db, actor.project.id, otherRole);
  const note = bVa2({ name: actor.firstName, project: actor.project.name, title, amount: naira(amount) });
  for (const person of others) {
    await notify(db, { userId: person.id, messageId: "B-VA-2", text: note, dedupeKey: `bva2:${row.id}:${person.id}`, chatId: person.telegramId.toString() });
  }
  return replace(note, variationReplyKeyboard(row.id));
}

export async function respondVariation(db: Database, actor: Actor, changeId: string, accept: boolean): Promise<Outbound> {
  const change = (await db.select().from(changeRequests).where(eq(changeRequests.id, changeId)))[0];
  if (!change || !actor.project || change.projectId !== actor.project.id || change.status !== "pending") return replace(bGe4());
  if (change.requestedBy === actor.userId) return replace(bGe4());
  const after = change.afterJson as { title?: string; amountKobo?: string; stageId?: string };
  const title = after.title ?? "Change";
  const amount = BigInt(after.amountKobo ?? "0");
  if (!accept) {
    await db.update(changeRequests).set({ status: "declined", respondedAt: new Date() }).where(eq(changeRequests.id, change.id));
    return replace(bVa5({ title }));
  }
  const otherIsClient = actor.role === "client";
  const requesterIsClient = (await memberUsers(db, actor.project.id, "client")).some((person) => person.id === change.requestedBy);
  if (requesterIsClient === otherIsClient) return replace(bGe4());
  await db.update(changeRequests).set({ status: "accepted", respondedAt: new Date() }).where(eq(changeRequests.id, change.id));
  if (after.stageId && after.stageId !== "new") {
    const stage = (await db.select().from(stages).where(eq(stages.id, after.stageId)))[0];
    if (stage && actor.project.fxRateLocked > 0n) {
      await db.update(stages).set({ amountNgnKobo: amount, amountUsdc: usdcFromNgnKobo(amount, actor.project.fxRateLocked) }).where(eq(stages.id, stage.id));
    } else if (stage) {
      await db.update(stages).set({ amountNgnKobo: amount }).where(eq(stages.id, stage.id));
    }
  } else if (after.stageId === "new") {
    const existing = await db.select().from(stages).where(eq(stages.projectId, actor.project.id));
    const index = existing.length;
    const usdc = actor.project.fxRateLocked > 0n ? usdcFromNgnKobo(amount, actor.project.fxRateLocked) : 0n;
    await db.insert(stages).values({
      projectId: actor.project.id,
      workspaceId: actor.project.workspaceId,
      stageIndex: index,
      name: title,
      amountNgnKobo: amount,
      amountUsdc: usdc,
      retentionBps: actor.project.retentionBps,
      onChainIdx: index,
    });
  }
  return replace(bVa3({ title, amount: naira(amount) }));
}

export async function viewVariation(db: Database, actor: Actor, changeId: string): Promise<Outbound> {
  const change = (await db.select().from(changeRequests).where(eq(changeRequests.id, changeId)))[0];
  if (!change || !actor.project) return replace(bGe4());
  const after = change.afterJson as { title?: string; amountKobo?: string };
  const requester = (await partyRows(db, actor.project.id)).find((row) => row.userId === change.requestedBy);
  void requester;
  return replace(
    bVa2({
      name: actor.firstName,
      project: actor.project.name,
      title: after.title ?? "Change",
      amount: naira(BigInt(after.amountKobo ?? "0")),
    }),
    variationReplyKeyboard(change.id),
  );
}

export async function wallet(db: Database, actor: Actor): Promise<Outbound> {
  const denied = forbid(actor, ["contractor", "subcontractor"], "contractor");
  if (denied || !actor.project) return denied ?? say(bWa1({ project: "this project", lines: "None yet.", total: naira(0n), retention: naira(0n) }));
  const rows = (await db.select().from(payments).where(eq(payments.projectId, actor.project.id))).filter((row) => row.status === "confirmed" && row.kind === "release");
  const stageRows = await db.select().from(stages).where(eq(stages.projectId, actor.project.id));
  const lines = rows.map((row) => {
    const stage = stageRows.find((item) => item.id === row.stageId);
    return paymentLine({ n: (stage?.stageIndex ?? 0) + 1, amount: naira(row.amountNgnKobo), date: formatWatDate(row.createdAt) });
  });
  const total = rows.reduce((sum, row) => sum + row.amountNgnKobo, 0n);
  const retention = rows.reduce((sum, row) => {
    const stage = stageRows.find((item) => item.id === row.stageId);
    return sum + retentionKobo(row.amountNgnKobo, stage?.retentionBps ?? 0);
  }, 0n);
  return say(
    bWa1({
      project: actor.project.name,
      lines: lines.length > 0 ? lines.join("\n") : "None yet.",
      total: naira(total),
      retention: naira(retention),
    }),
    walletKeyboard(),
  );
}

export async function technical(db: Database, actor: Actor): Promise<Outbound> {
  const denied = forbid(actor, ["contractor", "subcontractor"], "contractor");
  if (denied || !actor.project) return denied ?? replace(bGe4());
  const party = (await db.select().from(parties).where(eq(parties.userId, actor.userId))).find((row) => row.projectId === actor.project?.id);
  return replace(
    `${bWa2({ address: party?.walletAddress ?? "Not created yet." })}\nEscrow stays on Ethereum Sepolia. Weather checks are paid on Base Sepolia from the agent wallet.`,
  );
}

export async function report(actor: Actor, deps: EngineDeps): Promise<Outbound> {
  const denied = forbid(actor, ["client", "consultant"], "client");
  if (denied) return denied;
  const weather = deps.paidWeather ? await deps.paidWeather() : "Weather check was not run.";
  return say(weather);
}
