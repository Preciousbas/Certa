import { projects, startOwnProject, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { audit } from "../../server/audit.js";
import { parseStartDate } from "../dates.js";
import { createdKeyboard, roleSideKeyboard, skipLocationKeyboard } from "../keyboards.js";
import { bPr1, bPr2, bPr3, bPr4, bPr4Invalid, bPr5, bPrRole } from "../messages.js";
import { writeSession } from "../state.js";
import { say, type Actor, type Outbound, type Person } from "./common.js";

export async function begin(db: Database, actor: Actor, now: Date): Promise<Outbound> {
  await writeSession(db, actor.telegramId, { step: "project_name", projectId: actor.project?.id ?? null, data: {} }, now);
  return say(bPr1());
}

export async function onName(db: Database, actor: Actor, text: string, now: Date): Promise<Outbound> {
  const name = text.trim();
  if (!name || name.startsWith("/")) return say(bPr1());
  await writeSession(db, actor.telegramId, { step: "project_site", projectId: actor.project?.id ?? null, data: { name } }, now);
  return say(bPr2());
}

export async function onSite(db: Database, actor: Actor, text: string, now: Date): Promise<Outbound> {
  const site = text.trim();
  if (!site || site.startsWith("/")) return say(bPr2());
  await writeSession(db, actor.telegramId, { step: "project_pin", data: { ...actor.session.data, site } }, now);
  return say(bPr3(), skipLocationKeyboard());
}

export async function onPin(db: Database, actor: Actor, pin: { latitude?: number; longitude?: number } | null, now: Date): Promise<Outbound> {
  if (actor.session.step !== "project_pin") return { messages: [] };
  const data = { ...actor.session.data };
  if (pin) {
    data.lat = String(pin.latitude ?? "");
    data.lng = String(pin.longitude ?? "");
  }
  await writeSession(db, actor.telegramId, { step: "project_start", data }, now);
  return say(bPr4());
}

export async function onStartDate(db: Database, actor: Actor, _person: Person, text: string, now: Date, _depsNow: Date): Promise<Outbound> {
  const start = parseStartDate(text);
  if (!start) return say(bPr4Invalid());
  await writeSession(db, actor.telegramId, { step: "project_role", data: { ...actor.session.data, start } }, now);
  return say(bPrRole(), roleSideKeyboard());
}

export async function onProjectRole(db: Database, actor: Actor, person: Person, text: string, now: Date): Promise<Outbound> {
  const role = text.trim().toLowerCase();
  if (role !== "client" && role !== "contractor") return say(bPrRole(), roleSideKeyboard());
  const name = actor.session.data.name ?? "";
  const site = actor.session.data.site ?? "";
  const created = await startOwnProject(db, {
    telegramId: actor.telegramId,
    name: person.firstName || "Telegram",
    projectName: name,
    role,
    site,
  });
  const lat = +(actor.session.data.lat ?? "");
  const lng = +(actor.session.data.lng ?? "");
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    await db.update(projects).set({ siteLat: lat, siteLng: lng }).where(eq(projects.id, created.projectId));
  }
  await audit(db, {
    action: "project.planned_start",
    entity: "projects",
    entityId: created.projectId,
    projectId: created.projectId,
    workspaceId: created.workspaceId,
    actor: created.userId,
    after: { start: actor.session.data.start ?? "" },
  });
  await writeSession(db, actor.telegramId, { step: null, projectId: created.projectId }, now);
  return say(bPr5({ project: name }), createdKeyboard());
}
