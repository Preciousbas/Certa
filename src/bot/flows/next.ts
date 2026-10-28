import {
  contractAcceptances,
  contractVersions,
  documents,
  extractions,
  memberships,
  projects,
  stages,
  users,
  type Database,
} from "@certa/db";
import { and, desc, eq } from "drizzle-orm";

export function withNext(text: string, line: string): string {
  const extra = line.trim();
  if (!extra) return text;
  if (text.trim().endsWith(extra)) return text;
  return `${text}\n${extra}`;
}

type Voice = "client" | "contractor" | "consultant";

function voiceOf(role: string): Voice | null {
  if (role === "client") return "client";
  if (role === "contractor" || role === "subcontractor") return "contractor";
  if (role === "consultant") return "consultant";
  return null;
}

export async function nextStep(db: Database, projectId: string, userId: string, role: string): Promise<string> {
  const voice = voiceOf(role);
  if (!voice) return "";
  const members = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.projectId, projectId), eq(memberships.status, "active")));
  const has = (wanted: string) => members.some((row) => row.role === wanted);
  const people = await db.select().from(users);
  const nameOf = (wanted: string) => {
    const member = members.find((row) => row.role === wanted);
    return people.find((person) => person.id === member?.userId)?.name ?? "";
  };
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
  if (voice !== "consultant") {
    const other = voice === "client" ? "contractor" : "client";
    if (!has(other)) {
      return voice === "client" ? "Next: invite the contractor. Tap Invite people." : "Next: invite the client. Tap Invite people.";
    }
    if (!has("consultant") && project?.approvalMode !== "client") {
      if (project?.approvalMode === null || project?.approvalMode === undefined) return "Next: invite a consultant, or tap No consultant, skip.";
      return "Next: invite the consultant. Money can't be locked until one joins.";
    }
  }
  const versions = (
    await db.select().from(contractVersions).where(eq(contractVersions.projectId, projectId)).orderBy(desc(contractVersions.version))
  );
  const latest = versions[0];
  const accepted = versions.find((row) => row.status === "accepted");
  const stageRows = (await db.select().from(stages).where(eq(stages.projectId, projectId))).sort((a, b) => a.stageIndex - b.stageIndex);
  const work = stageRows.filter((stage) => stage.kind !== "mobilisation");
  if (!latest || (latest.status !== "pending_acceptance" && latest.status !== "accepted" && !accepted)) {
    const files = await db.select().from(documents).where(eq(documents.projectId, projectId));
    const extracted = await db.select().from(extractions).where(eq(extractions.projectId, projectId));
    const ready = extracted.some((row) => {
      const saved = row.validatedJson as { stages?: unknown[] } | null;
      return Array.isArray(saved?.stages) && saved.stages.length > 0;
    }) || (files.length > 0 && stageRows.length > 0);
    if (!ready && stageRows.length === 0) {
      if (voice === "consultant") return "";
      return voice === "client" ? "Next: upload the contract or BoQ." : "Waiting for the client to upload the contract or BoQ.";
    }
    if (!accepted && latest?.status !== "pending_acceptance") {
      if (voice === "client") return "Next: open Review figures and send the plan to the contractor.";
      return "";
    }
  }
  const pending = latest?.status === "pending_acceptance" ? latest : undefined;
  if (pending && !accepted) {
    if (voice === "consultant") return "";
    const mine = voice === "client" ? "client" : "contractor";
    const rows = await db.select().from(contractAcceptances).where(eq(contractAcceptances.contractVersionId, pending.id));
    const acceptedMine = rows.some((row) => row.userId === userId && row.role === mine && row.decision === "accepted");
    if (!acceptedMine) return "Next: accept the plan.";
    const other = mine === "client" ? "contractor" : "client";
    const otherName = nameOf(other) || (other === "client" ? "the client" : "the contractor");
    return `Waiting for ${otherName} to accept.`;
  }
  if (!accepted && latest?.status !== "accepted") {
    if (voice === "consultant") return "";
    return voice === "client" ? "Next: upload the contract or BoQ." : "Waiting for the client to upload the contract or BoQ.";
  }
  const unlocked = work.filter((stage) => !stage.funded);
  if (unlocked.length > 0) {
    if (voice === "consultant") return "";
    return voice === "client" ? "Next: lock the money. Tap Fund." : "Waiting for the client to lock the money.";
  }
  const photoOpen = new Set(["not_started", "in_progress", "ai_fail", "needs_more_evidence"]);
  const open = work.find((stage) => stage.funded && photoOpen.has(stage.status));
  if (open) {
    if (voice === "consultant") return "";
    const label = `stage ${open.stageIndex + 1} — ${open.name}`;
    return voice === "client"
      ? `Waiting for photos for ${label}.`
      : `Next: send photos for ${label}. Tap Submit stage photos.`;
  }
  const certify = work.find((stage) => stage.status === "awaiting_certification");
  if (certify && voice === "consultant") return `Next: certify stage ${certify.stageIndex + 1}.`;
  const approval = work.find((stage) => stage.status === "awaiting_client_approval");
  if (approval && voice === "client") return `Next: approve payment for stage ${approval.stageIndex + 1}.`;
  if (work.length > 0 && work.every((stage) => stage.status === "released" || stage.status === "cancelled")) return "All stages are paid.";
  return "";
}

export async function planAgreed(db: Database, projectId: string): Promise<boolean> {
  const versions = await db.select().from(contractVersions).where(eq(contractVersions.projectId, projectId));
  return versions.some((row) => row.status === "accepted");
}

export async function fundMenuOpen(db: Database, projectId: string): Promise<boolean> {
  if (!(await planAgreed(db, projectId))) return false;
  const rows = await db.select().from(stages).where(eq(stages.projectId, projectId));
  return rows.some((stage) => stage.kind !== "mobilisation" && !stage.funded);
}
