import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq } from "drizzle-orm";
import { memberships, parties, stages, users, type Database } from "@certa/db";
import { AuthError, FORBIDDEN, NOT_SIGNED_IN } from "./errors.js";
import { adminTelegramIds } from "./http.js";
import { rolesFor, type Action, type Role } from "./matrix.js";

export type { Role };

export type AuthScope = { db: Database; userId: string };

export type MembershipRow = typeof memberships.$inferSelect;
export type UserRow = typeof users.$inferSelect;

const current = new AsyncLocalStorage<AuthScope>();

export function runAsUser<T>(scope: AuthScope, fn: () => Promise<T>): Promise<T> {
  return current.run(scope, fn);
}

export { adminTelegramIds };

function scopeOf(scope?: AuthScope): AuthScope {
  const found = scope ?? current.getStore();
  if (!found) throw NOT_SIGNED_IN;
  return found;
}

async function loadUser(db: Database, userId: string): Promise<UserRow> {
  const user = (await db.select().from(users).where(eq(users.id, userId)))[0];
  if (!user) throw NOT_SIGNED_IN;
  return user;
}

export function isRole(value: string): value is Role {
  return value === "client" || value === "consultant" || value === "contractor" || value === "subcontractor" || value === "viewer";
}

export async function requireMember(projectId: string, roles?: Role[], scope?: AuthScope) {
  const ctx = scopeOf(scope);
  const user = await loadUser(ctx.db, ctx.userId);
  const rows = await ctx.db
    .select()
    .from(memberships)
    .where(and(eq(memberships.projectId, projectId), eq(memberships.userId, user.id), eq(memberships.status, "active")));
  const membership = rows.find((row) => isRole(row.role) && (!roles || roles.includes(row.role)));
  if (!membership || !isRole(membership.role)) throw FORBIDDEN;
  return { user, membership };
}

export async function requirePlatformAdmin(scope?: AuthScope) {
  const ctx = scopeOf(scope);
  const user = await loadUser(ctx.db, ctx.userId);
  if (user.platformRole !== "platform_admin" || !adminTelegramIds().has(user.telegramId.toString())) {
    throw new AuthError(404, "not_found", "That page is not on Certa.");
  }
  return { user };
}

export async function assertCanSubmitStage(projectId: string, stageId: string, scope?: AuthScope) {
  const ctx = scopeOf(scope);
  const rows = await ctx.db
    .select()
    .from(memberships)
    .where(and(eq(memberships.projectId, projectId), eq(memberships.userId, ctx.userId), eq(memberships.status, "active")));
  const roles = rows.map((row) => row.role).filter(isRole);
  if (roles.includes("contractor")) return;
  if (!roles.includes("subcontractor")) throw FORBIDDEN;
  const stage = (
    await ctx.db.select().from(stages).where(and(eq(stages.id, stageId), eq(stages.projectId, projectId)))
  )[0];
  const party = (
    await ctx.db
      .select()
      .from(parties)
      .where(and(eq(parties.projectId, projectId), eq(parties.userId, ctx.userId), eq(parties.role, "subcontractor")))
  )[0];
  if (!stage || !party || stage.assignedPartyId !== party.id) throw FORBIDDEN;
}

export function actionRoles(action: Action): Role[] {
  return rolesFor(action);
}
