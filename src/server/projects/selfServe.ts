import {
  issueJoinCode,
  memberships,
  partyRoleFor,
  projects,
  revokeJoinCode,
  revokeOpenJoinCodes,
  type ContractSide,
  type Database,
} from "@certa/db";
import { joinDeepLink } from "@certa/shared";
import { and, eq } from "drizzle-orm";
import { FORBIDDEN } from "../auth/errors.js";
import { allows } from "../auth/matrix.js";
import { isRole } from "../auth/rbac.js";

export const INVITE_ROLES = ["client", "contractor", "consultant", "subcontractor"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

const FILLED = "That role is already filled.";
const NOT_ALLOWED = "You can't invite that role on this project.";

export function invitableRoles(actorRole: string, filled: Set<string>): InviteRole[] {
  const allowed: InviteRole[] =
    actorRole === "client"
      ? ["contractor", "consultant", "subcontractor"]
      : actorRole === "contractor"
        ? ["client", "consultant", "subcontractor"]
        : [];
  return allowed.filter((role) => !filled.has(role));
}

async function actingRole(db: Database, userId: string, projectId: string) {
  const rows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.projectId, projectId), eq(memberships.userId, userId), eq(memberships.status, "active")));
  const membership = rows.find((row) => isRole(row.role));
  if (!membership || !isRole(membership.role)) throw FORBIDDEN;
  return membership.role;
}

export async function createInvite(
  db: Database,
  input: { userId: string; projectId: string; role: string; botUsername: string },
) {
  const actorRole = await actingRole(db, input.userId, input.projectId);
  if (!allows(actorRole, "invite_extra")) throw FORBIDDEN;
  if (!INVITE_ROLES.includes(input.role as InviteRole)) return { ok: false as const, message: NOT_ALLOWED };
  const role = input.role as InviteRole;
  const rows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.projectId, input.projectId), eq(memberships.status, "active")));
  const filled = new Set(rows.map((row) => row.role));
  if (filled.has(role)) return { ok: false as const, message: FILLED };
  if (!invitableRoles(actorRole, filled).includes(role)) return { ok: false as const, message: NOT_ALLOWED };
  const project = (await db.select().from(projects).where(eq(projects.id, input.projectId)))[0];
  if (!project) throw FORBIDDEN;
  await revokeOpenJoinCodes(db, { projectId: input.projectId, role: partyRoleFor(role) });
  const issued = await issueJoinCode(db, {
    projectId: input.projectId,
    workspaceId: project.workspaceId,
    role: partyRoleFor(role),
  });
  return { ok: true as const, code: issued.code, link: joinDeepLink(input.botUsername, issued.code), role, expiresAt: issued.expiresAt };
}

export async function inviteFixedRole(
  db: Database,
  input: { userId: string; projectId: string; role: InviteRole; botUsername: string },
) {
  return createInvite(db, input);
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
