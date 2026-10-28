import { projects, startOwnProject, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { audit } from "../../server/audit.js";
import { geocodeSite } from "../../server/site/geocode.js";
import { formatIsoDate, formatWatDate, parseStartDate } from "../dates.js";
import { createdKeyboard, pinKeyboard, roleSideKeyboard, siteConfirmKeyboard } from "../keyboards.js";
import { bIn2, bPr1, bPr2, bPr3, bPr4, bPr4Invalid, bPr5, bPrRole } from "../messages.js";
import { writeSession } from "../state.js";
import { botUsername, roleLabel, say, type Actor, type Outbound, type Person } from "./common.js";
import { nextStep, withNext } from "./next.js";

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
  return say(`${bPr3()}\nSend a location pin, or skip.`, pinKeyboard());
}

async function askDate(db: Database, actor: Actor, data: Record<string, string>, now: Date): Promise<Outbound> {
  await writeSession(db, actor.telegramId, { step: "project_start", data }, now);
  return say(bPr4());
}

export async function onPin(db: Database, actor: Actor, pin: { latitude?: number; longitude?: number } | null, now: Date): Promise<Outbound> {
  if (actor.session.step === "site_pin") return saveLivePin(db, actor, pin, now);
  if (actor.session.step !== "project_pin") return { messages: [] };
  const data = { ...actor.session.data };
  if (pin && pin.latitude !== undefined && pin.longitude !== undefined) {
    data.lat = String(pin.latitude);
    data.lng = String(pin.longitude);
    data.pinSource = "telegram_pin";
    return askDate(db, actor, data, now);
  }
  const site = (data.site ?? "").trim();
  if (site && site !== "Not set yet") {
    const found = await geocodeSite(site);
    if (found) {
      data.lat = String(found.lat);
      data.lng = String(found.lng);
      data.pinLabel = found.label;
      data.pinSource = "geocode";
      await writeSession(db, actor.telegramId, { step: "project_pin_confirm", data }, now);
      return say(`Is this the site? ${found.label}`, siteConfirmKeyboard());
    }
    await writeSession(db, actor.telegramId, { step: "project_start", data }, now);
    return say(`I couldn't find that place. You can send the site pin later with /site.\n${bPr4()}`);
  }
  return askDate(db, actor, data, now);
}

export async function confirmGeocode(db: Database, actor: Actor, yes: boolean, now: Date): Promise<Outbound> {
  if (actor.session.step === "site_pin_confirm") return confirmLiveGeocode(db, actor, yes, now);
  if (actor.session.step !== "project_pin_confirm") return { messages: [] };
  const data = { ...actor.session.data };
  if (!yes) {
    delete data.lat;
    delete data.lng;
    delete data.pinSource;
    delete data.pinLabel;
  }
  return askDate(db, actor, data, now);
}

export async function onStartDate(db: Database, actor: Actor, _person: Person, text: string, now: Date, _depsNow: Date): Promise<Outbound> {
  const start = parseStartDate(text);
  if (!start) return say(bPr4Invalid());
  await writeSession(db, actor.telegramId, { step: "project_role", data: { ...actor.session.data, start } }, now);
  return say(bPrRole(), roleSideKeyboard());
}

export async function onProjectRole(db: Database, actor: Actor, person: Person, text: string, now: Date): Promise<Outbound> {
  if (actor.session.step !== "project_role") return { messages: [] };
  const role = text.trim().toLowerCase();
  if (role !== "client" && role !== "contractor") return say(bPrRole(), roleSideKeyboard());
  const name = (actor.session.data.name ?? "").trim();
  if (!name) return say(bPr1());
  const start = actor.session.data.start ? formatIsoDate(actor.session.data.start) : "";
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
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) && actor.session.data.pinSource) {
    await db.update(projects).set({
      siteLat: lat,
      siteLng: lng,
      sitePinSource: actor.session.data.pinSource,
      sitePinLabel: actor.session.data.pinLabel ?? null,
      sitePinSetAt: now,
    }).where(eq(projects.id, created.projectId));
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
  const link = `https://t.me/${botUsername({})}?start=join_${created.inviteCode}`;
  const line = await nextStep(db, created.projectId, created.userId, role);
  return {
    messages: [
      { text: withNext(bPr5({ project: name, start }), line), keyboard: createdKeyboard() },
      {
        text: bIn2({
          roleLabel: roleLabel(created.inviteRole),
          date: formatWatDate(created.inviteExpiresAt),
          link,
        }),
      },
    ],
  };
}

export async function beginSite(db: Database, actor: Actor, now: Date): Promise<Outbound> {
  if (!actor.project || (actor.role !== "client" && actor.role !== "contractor")) {
    return say("Open a project as the client or the contractor first.");
  }
  await writeSession(db, actor.telegramId, { step: "site_pin", projectId: actor.project.id, data: {} }, now);
  return say("Send a location pin, or type the site address.", pinKeyboard());
}

async function saveLivePin(db: Database, actor: Actor, pin: { latitude?: number; longitude?: number } | null, now: Date): Promise<Outbound> {
  if (!actor.project || !pin || pin.latitude === undefined || pin.longitude === undefined) return say("Send a location pin, or type the site address.", pinKeyboard());
  await db.update(projects).set({
    siteLat: pin.latitude,
    siteLng: pin.longitude,
    sitePinSource: "telegram_pin",
    sitePinSetAt: now,
  }).where(eq(projects.id, actor.project.id));
  await writeSession(db, actor.telegramId, { step: null, projectId: actor.project.id }, now);
  const line = await nextStep(db, actor.project.id, actor.userId, actor.role ?? "client");
  return say(withNext("Site pin saved.", line));
}

export async function onSiteAddress(db: Database, actor: Actor, text: string, now: Date): Promise<Outbound> {
  const found = await geocodeSite(text.trim());
  if (!found) return say("I couldn't find that place. Send a location pin, or try another address.");
  await writeSession(db, actor.telegramId, {
    step: "site_pin_confirm",
    projectId: actor.project?.id ?? null,
    data: { lat: String(found.lat), lng: String(found.lng), pinLabel: found.label },
  }, now);
  return say(`Is this the site? ${found.label}`, siteConfirmKeyboard());
}

async function confirmLiveGeocode(db: Database, actor: Actor, yes: boolean, now: Date): Promise<Outbound> {
  if (!yes || !actor.project) {
    await writeSession(db, actor.telegramId, { step: null, projectId: actor.project?.id ?? null }, now);
    return say("Site pin left as it was.");
  }
  const lat = +(actor.session.data.lat ?? "");
  const lng = +(actor.session.data.lng ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return say("I couldn't find that place.");
  await db.update(projects).set({
    siteLat: lat,
    siteLng: lng,
    sitePinSource: "geocode",
    sitePinLabel: actor.session.data.pinLabel ?? null,
    sitePinSetAt: now,
  }).where(eq(projects.id, actor.project.id));
  await writeSession(db, actor.telegramId, { step: null, projectId: actor.project.id }, now);
  const line = await nextStep(db, actor.project.id, actor.userId, actor.role ?? "client");
  return say(withNext("Site pin saved.", line));
}
