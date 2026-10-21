import {
  issueJoinCode,
  memberships,
  partyRoleFor,
  projects,
  revokeJoinCode,
  type ContractSide,
  type Database,
} from "@certa/db";
import { joinDeepLink } from "@certa/shared";
import { and, eq } from "drizzle-orm";
import { FORBIDDEN } from "../auth/errors.js";
import { allows } from "../auth/matrix.js";
import { isRole } from "../auth/rbac.js";

export const EXTRA_ROLES = ["consultant", "subcontractor"] as const;
export type ExtraRole = (typeof EXTRA_ROLES)[number];

const SIDE_TAKEN = "That side of the contract is already taken.";

async function actingRole(db: Database, userId: string, projectId: string) {
  const rows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.projectId, projectId), eq(memberships.userId, userId), eq(memberships.status, "active")));
  const membership = rows.find((row) => isRole(row.role));
  if (!membership || !isRole(membership.role)) throw FORBIDDEN;
  return membership.role;
}

async function sideOpen(db: Database, projectId: string, role: string) {
  const rows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.projectId, projectId), eq(memberships.role, role), eq(memberships.status, "active")));
  return rows.length === 0;
}

export async function inviteFixedRole(
  db: Database,
  input: { userId: string; projectId: string; role: ExtraRole; botUsername: string },
) {
  const role = await actingRole(db, input.userId, input.projectId);
  if (!allows(role, "invite_extra")) throw FORBIDDEN;
  if (!(await sideOpen(db, input.projectId, input.role))) return { ok: false as const, message: SIDE_TAKEN };
  const project = (await db.select().from(projects).where(eq(projects.id, input.projectId)))[0];
  if (!project) throw FORBIDDEN;
  const issued = await issueJoinCode(db, {
    projectId: input.projectId,
    workspaceId: project.workspaceId,
    role: partyRoleFor(input.role),
  });
  return { ok: true as const, code: issued.code, link: joinDeepLink(input.botUsername, issued.code), role: input.role };
}

export async function revokeProjectInvite(
  db: Database,
  input: { userId: string; projectId: string; code: string },
) {
  const role = await actingRole(db, input.userId, input.projectId);
  if (!allows(role, "invite_extra")) throw FORBIDDEN;
  const revoked = await revokeJoinCode(db, { projectId: input.projectId, code: input.code });
  if (!revoked) throw FORBIDDEN;
  return { ok: true as const };
}

export function sideLabel(role: string): string {
  if (role === "client") return "Client";
  if (role === "contractor") return "Contractor";
  if (role === "consultant") return "Consultant";
  if (role === "subcontractor") return "Subcontractor";
  return role;
}

export type { ContractSide };
