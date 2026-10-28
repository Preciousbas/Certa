import { createPartyWallet } from "@certa/chain";
import { contractVersions, ensureWallet, parties, redeemJoinCode, stages, type Database } from "@certa/db";
import { and, desc, eq } from "drizzle-orm";
import { formatNaira } from "../../lib/money/kobo.js";
import { getOrCreateWallet } from "../../server/chain/wallets.js";
import { formatIsoDate } from "../dates.js";
import { escapeHtml } from "../html.js";
import { notifyPlanShared } from "../../server/intake/notify.js";
import { joinedPayKeyboard } from "../keyboards.js";
import { bGe7, bIn10, bIn11, bIn4, bIn5, bIn6, bIn8, bIn9, bSt5 } from "../messages.js";
import { notify } from "../notify.js";
import { writeSession } from "../state.js";
import { memberUsers, roleLabel, say, type Actor, type Outbound } from "./common.js";
import { announceConsultantJoined } from "../../server/projects/approvalMode.js";
import { nextStep, withNext } from "./next.js";

function paymentPurpose(role: string): "client" | "consultant" | "contractor" | "subcontractor" | null {
  if (role === "client" || role === "consultant" || role === "contractor" || role === "subcontractor") return role;
  return null;
}

function joinedCopy(role: string, project: string): string {
  if (role === "client") return bIn11({ project });
  if (role === "consultant") return bIn5({ project });
  return bIn4({ project });
}

export async function joinWithCode(db: Database, actor: Actor, code: string, now: Date): Promise<Outbound> {
  const result = await redeemJoinCode(db, { telegramId: actor.telegramId, name: actor.firstName, code, now });
  await writeSession(db, actor.telegramId, { step: null, projectId: result.ok ? result.projectId : (actor.project?.id ?? null) }, now);
  if (!result.ok) {
    if (result.reason === "rate_limited") return say(bGe7());
    if (result.reason === "revoked") return say(bIn9());
    if (result.reason === "taken") return say(bIn8());
    if (result.reason === "other_role") {
      return say(
        `You're already in ${result.projectName ?? "this project"} as ${roleLabel(result.currentRole ?? "member").toLowerCase()}. One person can't hold two roles on a project. Ask whoever invited you to invite someone else.`,
      );
    }
    return say(bSt5());
  }
  const line = await nextStep(db, result.projectId, actor.userId, result.role);
  if (result.already) {
    return say(withNext(`You're already in ${result.projectName} as ${roleLabel(result.role).toLowerCase()}.`, line));
  }
  const party = result.partyId ? (await db.select().from(parties).where(eq(parties.id, result.partyId)))[0] : undefined;
  const copy = joinedCopy(result.role, result.projectName);
  try {
    const purpose = paymentPurpose(result.role);
    if (result.partyId) {
      await ensureWallet(db, result.partyId, async () => {
        if (!party || !purpose) return createPartyWallet(result.partyId);
        const wallet = await getOrCreateWallet(db, { purpose, userId: party.userId ?? undefined, projectId: result.projectId });
        return { address: wallet.address, walletId: wallet.accountRef, mock: wallet.mock };
      });
    }
  } catch (error) {
    console.error(JSON.stringify({ msg: "join wallet", message: error instanceof Error ? error.message : "failed" }));
    return say(withNext(`${copy}\n${bIn10()}`, line));
  }
  const listeners = [
    ...(await memberUsers(db, result.projectId, "client")),
    ...(await memberUsers(db, result.projectId, "contractor")),
  ];
  const told = new Set<string>();
  for (const person of listeners) {
    if (person.id === actor.userId || told.has(person.id)) continue;
    told.add(person.id);
    await notify(db, {
      userId: person.id,
      messageId: "B-IN-6",
      text: bIn6({ name: actor.firstName, project: result.projectName, roleLabel: roleLabel(result.role) }),
      dedupeKey: `bin6:${result.projectId}:${actor.userId}`,
      chatId: person.telegramId.toString(),
    });
  }
  if (result.role === "consultant") {
    await announceConsultantJoined(db, { projectId: result.projectId, userId: actor.userId, name: actor.firstName });
  }
  if (result.role === "client" || result.role === "contractor") {
    const version = (
      await db.select().from(contractVersions).where(eq(contractVersions.projectId, result.projectId)).orderBy(desc(contractVersions.version))
    )[0];
    if (version?.status === "pending_acceptance") {
      const stageRows = (
        await db.select().from(stages).where(and(eq(stages.projectId, result.projectId), eq(stages.contractVersionId, version.id)))
      ).sort((a, b) => a.stageIndex - b.stageIndex);
      const stageLines = stageRows.map((stage) => {
        const due = stage.expectedFinish ? ` · due ${formatIsoDate(stage.expectedFinish)}` : "";
        return `${stage.stageIndex + 1}. ${escapeHtml(stage.name)} — ${formatNaira(stage.amountNgnKobo)}${due}`;
      }).join("\n");
      await notifyPlanShared(db, {
        projectId: result.projectId,
        versionId: version.id,
        clientName: (await memberUsers(db, result.projectId, "client"))[0]?.name ?? "The client",
        projectName: result.projectName,
        sumKobo: version.contractSumKobo,
        stageLines,
        retentionBps: version.retentionBps,
        defectsMonths: Math.max(1, Math.round(version.defectsPeriodDays / 30)),
        onlyUserId: actor.userId,
      });
    }
  }
  const keyboard = result.role === "contractor" || result.role === "subcontractor" ? joinedPayKeyboard() : undefined;
  return say(withNext(copy, line), keyboard);
}
