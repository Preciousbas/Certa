import { memberships, parties, projects, stages, users, upsertTelegramUser, type Database } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { roleMenu, startKeyboard, type BotKeyboard } from "../keyboards.js";
import { bGe1, bSt1, bSt3 } from "../messages.js";
import { readSession, type SessionRecord } from "../state.js";

export type Person = { id: number; firstName: string };

export type OutMessage = { text: string; keyboard?: BotKeyboard };

export type Outbound = { messages: OutMessage[]; edit?: OutMessage };

export type Actor = {
  telegramId: bigint;
  firstName: string;
  userId: string;
  fromId: number;
  userName: string;
  project: typeof projects.$inferSelect | null;
  role: string | null;
  session: SessionRecord;
};

export type ReleaseInput = {
  projectId: string;
  stageId: string;
  approvalId: string;
  stageIndex: number;
  amountMicro: bigint;
  capMicro: bigint;
};

export type EngineDeps = {
  appUrl?: string;
  supportEmail?: string;
  botUsername?: string;
  now?: () => Date;
  paidWeather?: () => Promise<string>;
  release?: (input: ReleaseInput) => Promise<{ ok: true; explorerLink: string } | { ok: false; reason: string }>;
  ingest?: (input: {
    projectId: string;
    workspaceId: string;
    userId: string;
    fileName: string;
    bytes: Uint8Array;
  }) => Promise<{ ok: true; pagesOrSheets: string } | { ok: false; message: string }>;
};

export function appUrl(deps: EngineDeps): string {
  return (deps.appUrl || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function supportEmail(deps: EngineDeps): string {
  return deps.supportEmail || process.env.SUPPORT_EMAIL || "support@example.com";
}

export function botUsername(deps: EngineDeps): string {
  return (deps.botUsername || process.env.TELEGRAM_BOT_USERNAME || process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "CertaApp_bot").replace(/^@/, "");
}

export function say(text: string, keyboard?: BotKeyboard): Outbound {
  return { messages: [keyboard ? { text, keyboard } : { text }] };
}

export function replace(text: string, keyboard?: BotKeyboard): Outbound {
  return { messages: [], edit: keyboard ? { text, keyboard } : { text } };
}

export function roleLabel(role: string): string {
  if (role === "subcontractor") return "Subcontractor";
  if (role === "contractor") return "Contractor";
  if (role === "consultant") return "Consultant";
  if (role === "client") return "Client";
  return role;
}

export async function loadActor(db: Database, person: Person, now: Date): Promise<Actor> {
  const user = await upsertTelegramUser(db, BigInt(person.id), person.firstName || "Telegram");
  const memberRows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.status, "active")));
  const session = await readSession(db, BigInt(person.id), now);
  let projectId = session.projectId;
  if (projectId && !memberRows.some((row) => row.projectId === projectId)) projectId = null;
  if (!projectId) projectId = memberRows[0]?.projectId ?? null;
  const project = projectId ? ((await db.select().from(projects).where(eq(projects.id, projectId)))[0] ?? null) : null;
  const role = project ? (memberRows.find((row) => row.projectId === project.id)?.role ?? null) : null;
  return {
    telegramId: BigInt(person.id),
    fromId: person.id,
    firstName: person.firstName,
    userId: user.id,
    userName: user.name,
    project,
    role,
    session,
  };
}

export async function waitingCount(db: Database, projectId: string, role: string | null): Promise<number> {
  const rows = await db.select().from(stages).where(eq(stages.projectId, projectId));
  if (role === "client") return rows.filter((row) => row.status === "awaiting_client_approval").length;
  if (role === "consultant") {
    return rows.filter((row) => row.status === "awaiting_certification" || row.status === "needs_more_evidence").length;
  }
  return 0;
}

export async function menuFor(db: Database, actor: Actor, deps: EngineDeps): Promise<Outbound> {
  if (!actor.project || !actor.role) return say(bSt1(), startKeyboard());
  const waiting = await waitingCount(db, actor.project.id, actor.role);
  return say(
    bSt3({ firstName: actor.firstName, project: actor.project.name, roleLabel: roleLabel(actor.role) }),
    roleMenu(actor.role, waiting, appUrl(deps), actor.project.id),
  );
}

export function forbid(actor: Actor, allowed: readonly string[], requiredLabel: string): Outbound | null {
  if (!actor.project) return say(bSt1(), startKeyboard());
  if (actor.role && allowed.includes(actor.role)) return null;
  return say(bGe1({ requiredRole: requiredLabel, project: actor.project.name }));
}

export async function memberUsers(db: Database, projectId: string, role: string) {
  const rows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.projectId, projectId), eq(memberships.role, role), eq(memberships.status, "active")));
  if (rows.length === 0) return [];
  const people = await db.select().from(users);
  const ids = new Set(rows.map((row) => row.userId));
  return people.filter((person) => ids.has(person.id));
}

export async function partyRows(db: Database, projectId: string) {
  return db.select().from(parties).where(eq(parties.projectId, projectId));
}
