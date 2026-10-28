import {
  approvals,
  contractVersions,
  memberships,
  partyRoleFor,
  projects,
  revokeOpenJoinCodes,
  stages,
  users,
  type Database,
} from "@certa/db";
import { and, eq } from "drizzle-orm";
import { notify } from "../../bot/notify.js";
import { consultantAgreeKeyboard } from "../../bot/keyboards.js";
import { allows } from "../auth/matrix.js";
import { isRole } from "../auth/rbac.js";

export type ApprovalMode = "consultant" | "client";

type ProjectMode = {
  id?: string;
  approvalMode: ApprovalMode | null;
  consultantFromStage?: number | null;
};

type StageIndex = { id?: string; stageIndex: number };

const LOCKED = "Money is already locked with a consultant on this project, so you can't remove them.";
const DENIED = "You don't have permission to do this on this project.";

export function requiredRoles(project: { approvalMode: ApprovalMode | null }): Array<"client" | "contractor" | "consultant"> {
  if (project.approvalMode === "client") return ["client", "contractor"];
  return ["client", "contractor", "consultant"];
}

export function stageReviewer(project: ProjectMode, stage: StageIndex): "consultant" | "client" {
  if (project.approvalMode !== "consultant") return project.approvalMode === "client" ? "client" : "consultant";
  const from = project.consultantFromStage ?? 0;
  return stage.stageIndex >= from ? "consultant" : "client";
}

function dated(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Lagos" }).format(at);
}

export async function approverLine(db: Database, stage: { id: string }): Promise<string> {
  const rows = await db.select().from(approvals).where(eq(approvals.stageId, stage.id));
  const certified = rows.find((row) => row.decision === "certified");
  if (certified) {
    const person = (await db.select().from(users).where(eq(users.id, certified.byUserId)))[0];
    return `Certified by ${person?.name ?? "the consultant"}, ${dated(certified.at)}`;
  }
  const approved = rows.find((row) => row.decision === "approved");
  if (approved) return "Approved by the client (no consultant)";
  return "";
}

export function noConsultantDispute(resolution: unknown): boolean {
  return Boolean(resolution && typeof resolution === "object" && "noConsultant" in resolution && (resolution as { noConsultant?: boolean }).noConsultant);
}

async function memberRole(db: Database, userId: string, projectId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.projectId, projectId), eq(memberships.userId, userId), eq(memberships.status, "active")));
  return rows[0]?.role ?? null;
}

async function projectLocked(db: Database, project: { escrowAddress: string | null }, projectId: string): Promise<boolean> {
  if (project.escrowAddress) return true;
  const rows = await db.select().from(stages).where(eq(stages.projectId, projectId));
  return rows.some((row) => row.funded);
}

async function activeConsultant(db: Database, projectId: string): Promise<{ userId: string; name: string } | null> {
  const member = (
    await db.select().from(memberships).where(and(eq(memberships.projectId, projectId), eq(memberships.role, "consultant"), eq(memberships.status, "active")))
  )[0];
  if (!member) return null;
  const person = (await db.select().from(users).where(eq(users.id, member.userId)))[0];
  return { userId: member.userId, name: person?.name ?? "The consultant" };
}

async function commitClientMode(db: Database, projectId: string): Promise<void> {
  await revokeOpenJoinCodes(db, { projectId, role: partyRoleFor("consultant") });
  await db.update(projects).set({ approvalMode: "client", approvalModeSetAt: new Date(), consultantFromStage: null }).where(eq(projects.id, projectId));
  const pending = (await db.select().from(contractVersions).where(eq(contractVersions.projectId, projectId))).find((row) => row.status === "pending_acceptance");
  if (pending) {
    await db.update(contractVersions).set({ status: "draft" }).where(eq(contractVersions.id, pending.id));
    await db.update(projects).set({ status: "draft" }).where(eq(projects.id, projectId));
  }
}

export async function canOfferSkip(db: Database, project: { id: string; approvalMode: ApprovalMode | null; escrowAddress: string | null }): Promise<boolean> {
  if (project.approvalMode !== null) return false;
  if (await projectLocked(db, project, project.id)) return false;
  if (await activeConsultant(db, project.id)) return false;
  return true;
}

export async function setApprovalMode(
  db: Database,
  input: { userId: string; projectId: string; mode: ApprovalMode; agreed?: boolean },
): Promise<{ ok: true; waiting?: string } | { ok: false; message: string }> {
  const project = (await db.select().from(projects).where(eq(projects.id, input.projectId)))[0];
  if (!project) return { ok: false, message: DENIED };
  const role = await memberRole(db, input.userId, input.projectId);
  if (input.mode === "client" && input.agreed) {
    if (role !== "contractor") return { ok: false, message: DENIED };
    if (await projectLocked(db, project, project.id)) return { ok: false, message: LOCKED };
    if (await activeConsultant(db, project.id)) {
      const named = await activeConsultant(db, project.id);
      return { ok: false, message: `${named?.name ?? "The consultant"} has joined as consultant. Keep them, or remove them first.` };
    }
    await commitClientMode(db, project.id);
    return { ok: true };
  }
  if (!role || !isRole(role) || !allows(role, "set_approval_mode")) return { ok: false, message: DENIED };
  if (input.mode === "consultant") {
    const locked = await projectLocked(db, project, project.id);
    let fromStage: number | null = project.consultantFromStage;
    if (!locked) fromStage = null;
    else if (project.approvalMode !== "consultant" || project.consultantFromStage === null) {
      const rows = await db.select().from(stages).where(eq(stages.projectId, project.id));
      const open = rows.filter((row) => row.status === "not_started" || row.status === "in_progress");
      fromStage = open.length > 0 ? Math.min(...open.map((row) => row.stageIndex)) : rows.length;
    }
    await db.update(projects).set({ approvalMode: "consultant", approvalModeSetAt: new Date(), consultantFromStage: fromStage }).where(eq(projects.id, project.id));
    return { ok: true };
  }
  if (await projectLocked(db, project, project.id)) return { ok: false, message: LOCKED };
  const consultant = await activeConsultant(db, project.id);
  if (consultant) return { ok: false, message: `${consultant.name} has joined as consultant. Keep them, or remove them first.` };
  const versions = await db.select().from(contractVersions).where(eq(contractVersions.projectId, project.id));
  const accepted = versions.some((row) => row.status === "accepted");
  if (accepted) {
    const client = (await db.select().from(users).where(eq(users.id, input.userId)))[0];
    const contractors = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.projectId, project.id), eq(memberships.role, "contractor"), eq(memberships.status, "active")));
    const people = contractors.length > 0 ? await db.select().from(users) : [];
    const text = `${client?.name ?? "The client"} wants to run this project without a consultant. The client will approve each stage.`;
    for (const member of contractors) {
      const person = people.find((row) => row.id === member.userId);
      if (!person) continue;
      await notify(db, {
        userId: person.id,
        chatId: person.telegramId.toString(),
        messageId: "B-AM-agree",
        dedupeKey: `bam-agree:${project.id}:${person.id}`,
        text,
        keyboard: consultantAgreeKeyboard(project.id),
      });
    }
    return { ok: true, waiting: "Waiting for the contractor to agree." };
  }
  await commitClientMode(db, project.id);
  return { ok: true };
}

export async function announceConsultantJoined(db: Database, input: { projectId: string; userId: string; name: string }): Promise<void> {
  const project = (await db.select().from(projects).where(eq(projects.id, input.projectId)))[0];
  if (!project) return;
  if (project.approvalMode !== "consultant") {
    const locked = await projectLocked(db, project, project.id);
    const rows = await db.select().from(stages).where(eq(stages.projectId, project.id));
    const open = rows.filter((row) => row.status === "not_started" || row.status === "in_progress");
    const fromStage = locked ? (open.length > 0 ? Math.min(...open.map((row) => row.stageIndex)) : rows.length) : null;
    await db.update(projects).set({ approvalMode: "consultant", approvalModeSetAt: new Date(), consultantFromStage: fromStage }).where(eq(projects.id, project.id));
  }
  const fresh = (await db.select().from(projects).where(eq(projects.id, input.projectId)))[0];
  const from = (fresh?.consultantFromStage ?? 0) + 1;
  const text = `${input.name} is now the consultant on ${project.name}. From stage ${from}, they certify each stage before the client approves payment.`;
  const listeners = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.projectId, input.projectId), eq(memberships.status, "active")));
  const people = await db.select().from(users);
  for (const member of listeners) {
    if (member.role !== "client" && member.role !== "contractor") continue;
    const person = people.find((row) => row.id === member.userId);
    if (!person) continue;
    await notify(db, {
      userId: person.id,
      chatId: person.telegramId.toString(),
      messageId: "B-AM-1",
      dedupeKey: `bam1:${input.projectId}:${input.userId}:${person.id}`,
      text,
    });
  }
}
