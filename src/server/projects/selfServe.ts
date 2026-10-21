import { issueJoinCode, memberships, partyRoleFor, projects, type Database, type StarterRole } from "@certa/db";
import { joinDeepLink } from "@certa/shared";
import { and, eq } from "drizzle-orm";
import { FORBIDDEN } from "../auth/errors.js";
import { allows, type Role } from "../auth/matrix.js";
import { isRole } from "../auth/rbac.js";

export const INVITE_ROLES = ["contractor", "consultant", "subcontractor"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export function creatorMayInvite(role: Role | StarterRole): boolean {
  return isRole(role) && allows(role, "invite_settings_pause");
}

export async function inviteToProject(
  db: Database,
  input: { userId: string; projectId: string; role: InviteRole; botUsername: string },
) {
  const rows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.projectId, input.projectId), eq(memberships.userId, input.userId), eq(memberships.status, "active")));
  const membership = rows.find((row) => isRole(row.role));
  if (!membership || !isRole(membership.role) || !allows(membership.role, "invite_settings_pause")) throw FORBIDDEN;
  const project = (await db.select().from(projects).where(eq(projects.id, input.projectId)))[0];
  if (!project) throw FORBIDDEN;
  const issued = await issueJoinCode(db, {
    projectId: input.projectId,
    workspaceId: project.workspaceId,
    role: partyRoleFor(input.role),
    ttlMs: 7 * 24 * 60 * 60 * 1000,
  });
  return { code: issued.code, link: joinDeepLink(input.botUsername, issued.code), role: input.role };
}
