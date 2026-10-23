import type { Database } from "@certa/db";
import { parseStartPayload } from "@certa/shared";
import { parseCallback } from "./callbacks.js";
import {
  acceptOrChange,
  approve,
  beginDispute,
  beginInvite,
  beginUpload,
  beginVariation,
  certify,
  chooseVariationStage,
  declineAsk,
  decideDispute,
  finishDispute,
  finishUpload,
  fund,
  issueInvite,
  listDisputes,
  myStages,
  onChangeReason,
  onDeclineReason,
  onDisputeReason,
  onRejectReason,
  onVariationAmount,
  onVariationTitle,
  photoStage,
  photos,
  planPour,
  rejectAsk,
  report,
  retryDocuments,
  respondVariation,
  reviewQueue,
  sendVariation,
  showPlan,
  takeDocument,
  technical,
  viewVariation,
  wallet,
} from "./flows/actions.js";
import { loadActor, say, type EngineDeps, type Outbound, type Person } from "./flows/common.js";
import { joinWithCode } from "./flows/join.js";
import { begin, onName, onPin, onProjectRole, onSite, onStartDate } from "./flows/project.js";
import { askCode, howItWorks, showMenu, welcome } from "./flows/start.js";
import { helpText } from "./flows/help.js";
import { bGe4, bGe9, bIn11, bIn7, bSt7, bUnknown } from "./messages.js";
import { writeSession } from "./state.js";
import { projectSwitchKeyboard } from "./keyboards.js";
import { memberships, projects, setActiveProject } from "@certa/db";
import { and, eq } from "drizzle-orm";

export type Inbound =
  | { type: "command"; command: string; arg: string; from: Person }
  | { type: "text"; text: string; from: Person }
  | { type: "callback"; data: string; from: Person }
  | { type: "location"; latitude: number; longitude: number; from: Person }
  | { type: "document"; fileName: string; bytes: Uint8Array; from: Person };

export async function handleIncoming(db: Database, inbound: Inbound, deps: EngineDeps = {}): Promise<Outbound> {
  const now = deps.now ? deps.now() : new Date();
  const actor = await loadActor(db, inbound.from, now);
  if (inbound.type === "command") return onCommand(db, actor, inbound, deps, now);
  if (inbound.type === "callback") return onCallback(db, actor, inbound.data, deps, now);
  if (inbound.type === "location") return onPin(db, actor, { latitude: inbound.latitude, longitude: inbound.longitude }, now);
  if (inbound.type === "document") return takeDocument(db, actor, inbound.fileName, inbound.bytes, deps);
  return onText(db, actor, inbound.text, inbound.from, deps, now);
}

async function onCommand(
  db: Database,
  actor: Awaited<ReturnType<typeof loadActor>>,
  inbound: Extract<Inbound, { type: "command" }>,
  deps: EngineDeps,
  now: Date,
): Promise<Outbound> {
  const command = inbound.command;
  if (command === "cancel") {
    await writeSession(db, actor.telegramId, { step: null, projectId: actor.project?.id ?? null }, now);
    return say(bGe9());
  }
  if (command === "start") {
    const parsed = parseStartPayload(inbound.arg);
    if (parsed.kind === "join") return joinWithCode(db, actor, parsed.code, now);
    return welcome(db, actor, deps);
  }
  if (command === "join") {
    if (!inbound.arg) return askCode(db, actor, now);
    return joinWithCode(db, actor, inbound.arg, now);
  }
  if (command === "menu") return showMenu(db, actor, deps);
  if (command === "new" || command === "newproject") return begin(db, actor, now);
  if (command === "help") return helpText(deps);
  if (command === "projects") return listProjects(db, actor);
  if (command === "upload") return beginUpload(db, actor, now);
  if (command === "done") {
    if (actor.session.step === "dispute_photos") return finishDispute(db, actor, now);
    return finishUpload(db, actor, now);
  }
  if (command === "photos") return photos(db, actor);
  if (command === "review") return reviewQueue(db, actor, deps);
  if (command === "fund") return fund(actor, deps);
  if (command === "wallet") return wallet(db, actor);
  return say(bUnknown());
}

async function onText(
  db: Database,
  actor: Awaited<ReturnType<typeof loadActor>>,
  text: string,
  person: Person,
  deps: EngineDeps,
  now: Date,
): Promise<Outbound> {
  const step = actor.session.step;
  if (step === "join_code") return joinWithCode(db, actor, text, now);
  if (step === "project_name") return onName(db, actor, text, now);
  if (step === "project_site") return onSite(db, actor, text, now);
  if (step === "project_start") return onStartDate(db, actor, person, text, now, now);
  if (step === "project_role") return onProjectRole(db, actor, person, text, now);
  if (step === "reject_reason") return onRejectReason(db, actor, text, now);
  if (step === "decline_reason") return onDeclineReason(db, actor, text, now);
  if (step === "change_reason") return onChangeReason(db, actor, text, now, deps);
  if (step === "dispute_reason") return onDisputeReason(db, actor, text, now);
  if (step === "dispute_photos") return finishDispute(db, actor, now);
  if (step === "variation_title") return onVariationTitle(db, actor, text, now);
  if (step === "variation_amount") return onVariationAmount(db, actor, text, now);
  return { messages: [] };
}

async function onCallback(
  db: Database,
  actor: Awaited<ReturnType<typeof loadActor>>,
  data: string,
  deps: EngineDeps,
  now: Date,
): Promise<Outbound> {
  const parsed = parseCallback(data);
  if (!parsed) return { messages: [], edit: { text: bGe4() } };
  const { action, id, arg } = parsed;
  if (action === "go" && id === "create") return begin(db, actor, now);
  if (action === "go" && id === "how") return howItWorks();
  if (action === "go" && id === "back") return welcome(db, actor, deps);
  if (action === "go" && id === "code") return askCode(db, actor, now);
  if (action === "go" && id === "menu") return showMenu(db, actor, deps);
  if (action === "go" && id === "upload") return beginUpload(db, actor, now);
  if (action === "go" && id === "done") return finishUpload(db, actor, now);
  if (action === "rx") return retryDocuments(db, actor);
  if (action === "go" && id === "invite") return beginInvite(actor);
  if (action === "go" && id === "fund") return fund(actor, deps);
  if (action === "go" && id === "photos") return photos(db, actor);
  if (action === "go" && id === "stages") return myStages(db, actor);
  if (action === "go" && id === "wallet") return wallet(db, actor);
  if (action === "go" && id === "change") return beginVariation(db, actor, now);
  if (action === "go" && id === "switch") return listProjects(db, actor);
  if (action === "go" && id === "review") return reviewQueue(db, actor, deps);
  if (action === "go" && id === "report") return report(actor, deps);
  if (action === "go" && id === "disputes") return listDisputes(db, actor, deps);
  if (action === "go" && id === "howpay") return say(bIn7());
  if (action === "go" && id === "skip") return onPin(db, actor, null, now);
  if (action === "sd") return onProjectRole(db, actor, { id: actor.fromId, firstName: actor.firstName }, id, now);
  if (action === "go" && id === "cancel") {
    await writeSession(db, actor.telegramId, { step: null, projectId: actor.project?.id ?? null }, now);
    return { messages: [], edit: { text: bGe9() } };
  }
  if (action === "ir") return issueInvite(db, actor, id, now, deps);
  if (action === "jn" && arg === "later") return { messages: [], edit: { text: bIn11({ project: actor.project?.name ?? "that project" }) } };
  if (action === "jn") return joinWithCode(db, actor, id, now);
  if (action === "sw") return switchProject(db, actor, id, deps);
  if (action === "ph") return photoStage(db, actor, id, deps);
  if (action === "pp") return planPour(db, actor, id);
  if (action === "cf") return certify(db, actor, id, deps);
  if (action === "rj") return rejectAsk(db, actor, id, now);
  if (action === "ap") return approve(db, actor, id, deps);
  if (action === "dc") return declineAsk(db, actor, id, now);
  if (action === "di") return beginDispute(db, actor, id, now);
  if (action === "ac") return acceptOrChange(db, actor, id, arg, now, deps);
  if (action === "dp") return decideDispute(db, actor, id, arg === "pay", deps);
  if (action === "vs") return chooseVariationStage(db, actor, id, now);
  if (action === "vg") return sendVariation(db, actor, now);
  if (action === "va") return respondVariation(db, actor, id, true);
  if (action === "vd") return respondVariation(db, actor, id, false);
  if (action === "vv") return viewVariation(db, actor, id);
  if (action === "wt") return technical(db, actor);
  if (action === "plan") return showPlan(db, actor, deps);
  return { messages: [], edit: { text: bGe4() } };
}

async function listProjects(db: Database, actor: Awaited<ReturnType<typeof loadActor>>): Promise<Outbound> {
  const rows = await db
    .select({ id: projects.id, name: projects.name })
    .from(memberships)
    .innerJoin(projects, eq(projects.id, memberships.projectId))
    .where(and(eq(memberships.userId, actor.userId), eq(memberships.status, "active")));
  if (rows.length === 0) return welcome(db, actor, {});
  return say(bSt7(), projectSwitchKeyboard(rows));
}

async function switchProject(db: Database, actor: Awaited<ReturnType<typeof loadActor>>, projectId: string, deps: EngineDeps): Promise<Outbound> {
  const ok = await setActiveProject(db, actor.telegramId, projectId, actor.userId);
  if (!ok) return { messages: [], edit: { text: bGe4() } };
  const fresh = await loadActor(db, { id: actor.fromId, firstName: actor.firstName }, deps.now ? deps.now() : new Date());
  return showMenu(db, fresh, deps);
}

export async function verdictText(id: string, params: Record<string, string | number>): Promise<string> {
  const messages = await import("./messages.js");
  const count = (value: string | number | undefined) => (typeof value === "number" ? value : +(value ?? "0"));
  const text = (value: string | number | undefined) => (typeof value === "string" ? value : String(value ?? ""));
  if (id === "B-VF-1") {
    return messages.bVf1({
      n: count(params.n),
      stage: text(params.stage),
      project: text(params.project),
      confidence: count(params.confidence),
      reasonsBullets: text(params.reasonsBullets),
    });
  }
  if (id === "B-VF-2") return messages.bVf2({ n: count(params.n), stage: text(params.stage), consultant: text(params.consultant), amount: text(params.amount) });
  if (id === "B-VF-3") return messages.bVf3({ n: count(params.n) });
  if (id === "B-VF-4") return messages.bVf4({ n: count(params.n), issuesBullets: text(params.issuesBullets) });
  if (id === "B-VF-5") return messages.bVf5({ n: count(params.n), missingShotsBullets: text(params.missingShotsBullets) });
  if (id === "B-VF-6") return messages.bVf6({ n: count(params.n), stage: text(params.stage), confidence: count(params.confidence) });
  if (id === "B-VF-7") return messages.bVf7({ n: count(params.n), project: text(params.project), flags: text(params.flags) });
  return messages.bGe4();
}
