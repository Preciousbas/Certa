import {
  contractVersions,
  createMemoryDatabase,
  issueJoinCode,
  jobs,
  joinCodes,
  memberships,
  parties,
  payments,
  projects,
  stages,
  users,
  workspaces,
  type Database,
} from "@certa/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callbackData } from "./callbacks.js";
import { handleIncoming, verdictText, type Inbound } from "./engine.js";
import type { Outbound } from "./flows/common.js";

let db: Database;
let close: () => Promise<void>;
let projectId = "";
let smallStage = "";
let largeStage = "";
let clientId = "";
let contractorId = "";

const client = { id: 7101, firstName: "Ada" };
const contractor = { id: 7102, firstName: "Kemfor" };
const consultant = { id: 7103, firstName: "Okafor" };
const sub = { id: 7104, firstName: "Danjuma" };
const stranger = { id: 7105, firstName: "Ngozi" };

function textOf(outbound: Outbound): string {
  return [outbound.edit?.text, ...outbound.messages.map((message) => message.text)].filter(Boolean).join("\n");
}

function labels(outbound: Outbound): string[] {
  const keyboard = outbound.edit?.keyboard ?? outbound.messages[0]?.keyboard ?? [];
  return keyboard.flat().map((button) => button.text);
}

async function send(inbound: Inbound, release?: () => Promise<{ ok: true; explorerLink: string } | { ok: false; reason: string }>) {
  return handleIncoming(db, inbound, {
    appUrl: "https://certa.example",
    supportEmail: "support@example.com",
    botUsername: "CertaApp_bot",
    now: () => new Date("2026-10-22T12:00:00Z"),
    ingest: async () => ({ ok: true, pagesOrSheets: "2 pages" }),
    ...(release ? { release } : {}),
  });
}

beforeAll(async () => {
  const opened = await createMemoryDatabase();
  db = opened.db;
  close = opened.close;
  const [clientUser] = await db.insert(users).values({ telegramId: BigInt(client.id), name: "Ada Client" }).returning();
  const [contractorUser] = await db.insert(users).values({ telegramId: BigInt(contractor.id), name: "Kemfor Construction" }).returning();
  const [consultantUser] = await db.insert(users).values({ telegramId: BigInt(consultant.id), name: "Engr Okafor" }).returning();
  const [subUser] = await db.insert(users).values({ telegramId: BigInt(sub.id), name: "Danjuma Concrete" }).returning();
  if (!clientUser || !contractorUser || !consultantUser || !subUser) throw new Error("users");
  clientId = clientUser.id;
  contractorId = contractorUser.id;
  const [workspace] = await db.insert(workspaces).values({ ownerUserId: clientUser.id, name: "Ada", company: "Ada Ltd" }).returning();
  if (!workspace) throw new Error("workspace");
  const [project] = await db
    .insert(projects)
    .values({
      workspaceId: workspace.id,
      name: "Plot 14 Lekki",
      siteLocation: "Lekki",
      siteLat: 6.4,
      siteLng: 3.4,
      geofenceRadiusM: 150,
      fxRateLocked: 133111n,
      fxSource: "test",
      spendingCapUsdc: 1_000_000n,
      retentionBps: 500,
      defectsPeriodDays: 180,
      contractSumKobo: 550_000n,
      contractSumUsdc: 4_000_000n,
    })
    .returning();
  if (!project) throw new Error("project");
  projectId = project.id;
  await db.insert(memberships).values([
    { projectId, userId: clientUser.id, role: "client" },
    { projectId, userId: contractorUser.id, role: "contractor" },
    { projectId, userId: consultantUser.id, role: "consultant" },
    { projectId, userId: subUser.id, role: "subcontractor" },
  ]);
  await db.insert(parties).values([
    { projectId, workspaceId: workspace.id, userId: contractorUser.id, role: "main_contractor", walletAddress: "0x1111111111111111111111111111111111111111" },
  ]);
  const [small] = await db
    .insert(stages)
    .values({
      projectId,
      workspaceId: workspace.id,
      stageIndex: 0,
      name: "Foundation",
      amountNgnKobo: 50_000n,
      amountUsdc: 400_000n,
      retentionBps: 500,
      status: "awaiting_client_approval",
      onChainIdx: 0,
      acceptanceCriteria: ["the footing"],
    })
    .returning();
  const [large] = await db
    .insert(stages)
    .values({
      projectId,
      workspaceId: workspace.id,
      stageIndex: 1,
      name: "Roof",
      amountNgnKobo: 500_000n,
      amountUsdc: 4_000_000n,
      retentionBps: 500,
      status: "in_progress",
      onChainIdx: 1,
      acceptanceCriteria: ["the covering"],
    })
    .returning();
  if (!small || !large) throw new Error("stages");
  smallStage = small.id;
  largeStage = large.id;
});

afterAll(async () => {
  await close();
});

describe("bot handlers", () => {
  it("welcomes a new person and explains Certa", async () => {
    const welcome = await send({ type: "command", command: "start", arg: "", from: stranger });
    expect(textOf(welcome)).toBe(
      "Welcome to Certa \u{1F477}\u{1F3FE}\nCerta holds building money safely and pays each stage only when the work is done and checked.\n\nWhat would you like to do?",
    );
    expect(labels(welcome)).toEqual(["Create a project", "I have a join code", "How Certa works"]);
    const how = await send({ type: "callback", data: callbackData("go", "how"), from: stranger });
    expect(textOf(how)).toContain("The client uploads the contract or BoQ");
  });

  it("shows a role menu for client, contractor, subcontractor and consultant", async () => {
    const asClient = await send({ type: "command", command: "menu", arg: "", from: client });
    expect(textOf(asClient)).toContain("Welcome back, Ada");
    expect(textOf(asClient)).toContain("Plot 14 Lekki");
    expect(labels(asClient)).toEqual(["Upload contract or BoQ", "Review figures", "Fund", "Waiting for me (1)", "Invite people", "Project report", "New project", "Switch project"]);
    const asContractor = await send({ type: "command", command: "menu", arg: "", from: contractor });
    expect(labels(asContractor)).toEqual(["Submit stage photos", "My stages", "Payments", "Propose change", "New project", "Switch project"]);
    const asSub = await send({ type: "command", command: "menu", arg: "", from: sub });
    expect(labels(asSub)).toEqual(["Submit stage photos", "My stages", "Payments", "New project"]);
    const again = await send({ type: "command", command: "newproject", arg: "", from: client });
    expect(textOf(again)).toContain("What's the project called?");
    const unknown = await send({ type: "command", command: "nope", arg: "", from: client });
    expect(textOf(unknown)).toBe("I don't know that command. Send /menu or /help.");
    const asConsultant = await send({ type: "command", command: "menu", arg: "", from: consultant });
    expect(labels(asConsultant)).toContain("Disputes");
    expect(labels(asConsultant)).toContain("Switch project");
  });

  it("rejects an invalid, expired or used join code and accepts a live one", async () => {
    const bad = await send({ type: "command", command: "join", arg: "NOPE9999", from: stranger });
    expect(textOf(bad)).toContain("isn't valid or has expired");
    const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
    if (!project) throw new Error("project");
    const [openProject] = await db
      .insert(projects)
      .values({
        workspaceId: project.workspaceId,
        name: "Join yard",
        siteLocation: "Yaba",
        siteLat: 6,
        siteLng: 3,
        geofenceRadiusM: 150,
        fxRateLocked: 100n,
        fxSource: "test",
        spendingCapUsdc: 1n,
        retentionBps: 0,
        defectsPeriodDays: 30,
        contractSumKobo: 1n,
        contractSumUsdc: 1n,
      })
      .returning();
    if (!openProject) throw new Error("open project");
    const { sha256Hex } = await import("@certa/db");
    const expiredCode = await issueJoinCode(db, { projectId: openProject.id, workspaceId: project.workspaceId, role: "main_contractor" });
    await db.update(joinCodes).set({ expiresAt: new Date("2020-01-01T00:00:00Z") }).where(eq(joinCodes.codeHash, sha256Hex(expiredCode.code)));
    const expired = await send({ type: "command", command: "start", arg: `join_${expiredCode.code}`, from: { id: 7201, firstName: "Late" } });
    expect(textOf(expired)).toContain("isn't valid or has expired");
    const live = await issueJoinCode(db, { projectId: openProject.id, workspaceId: project.workspaceId, role: "main_contractor" });
    const first = await send({ type: "command", command: "start", arg: `join_${live.code}`, from: { id: 7202, firstName: "First" } });
    expect(textOf(first)).toContain("You're in");
    expect(textOf(first)).toContain("Join yard");
    const second = await send({ type: "command", command: "start", arg: `join_${live.code}`, from: { id: 7203, firstName: "Second" } });
    expect(textOf(second)).toContain("isn't valid or has expired");
  });

  it("creates a project from the button flow", async () => {
    const maker = { id: 7301, firstName: "Bola" };
    await send({ type: "callback", data: callbackData("go", "create"), from: maker });
    await send({ type: "text", text: "4-bedroom duplex, Plot 14 Lekki", from: maker });
    await send({ type: "text", text: "Plot 14 Lekki", from: maker });
    await send({ type: "callback", data: callbackData("go", "skip"), from: maker });
    const dated = await send({ type: "text", text: "3 Nov 2026", from: maker });
    expect(textOf(dated)).toContain("Are you the Client or the Contractor?");
    const created = await send({ type: "callback", data: callbackData("sd", "client"), from: maker });
    expect(textOf(created)).toContain("Project created");
    expect(textOf(created)).toContain("4-bedroom duplex, Plot 14 Lekki");
    expect(labels(created)).toEqual(["Upload contract or BoQ", "Invite people"]);
    const makerUser = (await db.select().from(users).where(eq(users.telegramId, 7301n)))[0];
    const makerRole = makerUser
      ? (await db.select().from(memberships).where(eq(memberships.userId, makerUser.id)))[0]?.role
      : null;
    expect(makerRole).toBe("client");
    const builder = { id: 7303, firstName: "Chioma" };
    await send({ type: "callback", data: callbackData("go", "create"), from: builder });
    await send({ type: "text", text: "Fence", from: builder });
    await send({ type: "text", text: "Yaba", from: builder });
    await send({ type: "callback", data: callbackData("go", "skip"), from: builder });
    await send({ type: "text", text: "3 Nov 2026", from: builder });
    const asContractor = await send({ type: "callback", data: callbackData("sd", "contractor"), from: builder });
    expect(textOf(created)).toContain("Share this link with your Contractor");
    expect(textOf(asContractor)).toContain("Project created");
    expect(textOf(asContractor)).toContain("Share this link with your Client");
    expect(textOf(asContractor)).not.toContain("Subcontractor");
    const invited = await send({ type: "callback", data: callbackData("ir", "contractor"), from: maker });
    expect(textOf(invited)).toContain("Share this link with your Contractor");
    expect(textOf(invited)).not.toContain("Subcontractor");
    const builderUser = (await db.select().from(users).where(eq(users.telegramId, 7303n)))[0];
    const builderRole = builderUser
      ? (await db.select().from(memberships).where(eq(memberships.userId, builderUser.id)))[0]?.role
      : null;
    expect(builderRole).toBe("contractor");
    await send({ type: "callback", data: callbackData("go", "create"), from: { id: 7302, firstName: "Tunde" } });
    await send({ type: "text", text: "Annex", from: { id: 7302, firstName: "Tunde" } });
    await send({ type: "text", text: "Ikeja", from: { id: 7302, firstName: "Tunde" } });
    await send({ type: "callback", data: callbackData("go", "skip"), from: { id: 7302, firstName: "Tunde" } });
    const invalid = await send({ type: "text", text: "whenever", from: { id: 7302, firstName: "Tunde" } });
    expect(textOf(invalid)).toContain("I didn't understand that date");
  });

  it("accepts a plan and asks for a change", async () => {
    const [version] = await db
      .insert(contractVersions)
      .values({
        projectId,
        version: 1,
        status: "pending_acceptance",
        contractSumKobo: 550_000n,
        koboPerUsdc: 133111n,
        fxSource: "test",
        fxAsOf: "2026-10-15",
        spendingCapMicro: 1_000_000n,
        terms: { stages: [] },
        documentHashes: [],
        contentHash: "hash-1",
        createdBy: clientId,
      })
      .returning();
    if (!version) throw new Error("version");
    const accepted = await send({ type: "callback", data: callbackData("ac", version.id, "yes"), from: contractor });
    expect(textOf(accepted)).toContain("The other side still has to accept");
    const [nextVersion] = await db
      .insert(contractVersions)
      .values({
        projectId,
        version: 2,
        status: "pending_acceptance",
        contractSumKobo: 550_000n,
        koboPerUsdc: 133111n,
        fxSource: "test",
        fxAsOf: "2026-10-15",
        spendingCapMicro: 1_000_000n,
        terms: { stages: [] },
        documentHashes: [],
        contentHash: "hash-2",
        createdBy: clientId,
      })
      .returning();
    if (!nextVersion) throw new Error("version 2");
    const ask = await send({ type: "callback", data: callbackData("ac", nextVersion.id, "change"), from: contractor });
    expect(textOf(ask)).toContain("at least 10 characters");
    const changed = await send({ type: "text", text: "Split the roof into two stages", from: contractor });
    expect(textOf(changed)).toContain("asked for a change");
  });

  it("uploads a batch and asks for figures", async () => {
    const started = await send({ type: "command", command: "upload", arg: "", from: client });
    expect(textOf(started)).toContain("Send the contract or BoQ");
    const saved = await send({ type: "document", fileName: "boq.pdf", bytes: new Uint8Array([1, 2, 3]), from: client });
    expect(textOf(saved)).toContain("Got it: boq.pdf (2 pages)");
    const done = await send({ type: "command", command: "done", arg: "", from: client });
    expect(textOf(done)).toContain("Reading your documents now");
    const denied = await send({ type: "command", command: "upload", arg: "", from: contractor });
    expect(textOf(denied)).toContain("Only the client can do this");
  });

  it("opens fund for the client and refuses the contractor", async () => {
    const opened = await send({ type: "command", command: "fund", arg: "", from: client });
    expect(textOf(opened)).toContain("Lock money for Plot 14 Lekki");
    expect(opened.messages[0]?.keyboard?.[0]?.[0]).toMatchObject({ kind: "web_app", text: "Open Fund" });
    const denied = await send({ type: "command", command: "fund", arg: "", from: contractor });
    expect(textOf(denied)).toBe("Only the client can do this on Plot 14 Lekki.");
  });

  it("lists photo stages and each verdict line", async () => {
    const list = await send({ type: "command", command: "photos", arg: "", from: contractor });
    expect(textOf(list)).toContain("Which stage are you sending photos for?");
    expect(labels(list).join(" ")).toContain("Roof");
    const camera = await send({ type: "callback", data: callbackData("ph", largeStage), from: contractor });
    expect(textOf(camera)).toContain("Open the camera");
    expect(camera.messages[0]?.keyboard?.[0]?.[0]).toMatchObject({ kind: "web_app", text: "Open camera" });
    expect(await verdictText("B-VF-1", { n: 1, stage: "Foundation", project: "Plot 14 Lekki", confidence: 90, reasonsBullets: "• footing" })).toContain("passed Certa's check");
    expect(await verdictText("B-VF-2", { n: 1, stage: "Foundation", consultant: "Okafor", amount: "₦500.00" })).toContain("Waiting for Okafor");
    expect(await verdictText("B-VF-3", { n: 1 })).toContain("passed the check");
    expect(await verdictText("B-VF-4", { n: 1, issuesBullets: "• cover" })).toContain("isn't ready");
    expect(await verdictText("B-VF-5", { n: 1, missingShotsBullets: "• drain" })).toContain("send more photos");
    expect(await verdictText("B-VF-6", { n: 1, stage: "Foundation", confidence: 40 })).toContain("isn't sure");
    expect(await verdictText("B-VF-7", { n: 1, project: "Plot 14 Lekki", flags: "open shaft" })).toContain("Safety concern");
  });

  it("certifies, rejects, approves under and over the cap, and declines", async () => {
    await db.update(stages).set({ status: "awaiting_certification" }).where(eq(stages.id, largeStage));
    const certified = await send({ type: "callback", data: callbackData("cf", largeStage), from: consultant });
    expect(textOf(certified)).toContain("is certified");
    await db.update(stages).set({ status: "awaiting_certification" }).where(eq(stages.id, smallStage));
    await send({ type: "callback", data: callbackData("rj", smallStage), from: consultant });
    const rejected = await send({ type: "text", text: "The footing is still open", from: consultant });
    expect(textOf(rejected)).toContain("was not certified");
    await db.update(stages).set({ status: "in_progress" }).where(eq(stages.id, largeStage));
    await db.update(stages).set({ status: "awaiting_client_approval" }).where(eq(stages.id, smallStage));
    const underCap = await send({ type: "command", command: "review", arg: "", from: client });
    expect(textOf(underCap)).toContain("retention is kept");
    await db.update(stages).set({ status: "awaiting_client_approval" }).where(eq(stages.id, largeStage));
    await db.update(stages).set({ status: "in_progress" }).where(eq(stages.id, smallStage));
    const over = await send({ type: "command", command: "review", arg: "", from: client });
    expect(textOf(over)).toContain("above your spending cap");
    let calls = 0;
    const release = async () => {
      calls += 1;
      return { ok: true as const, explorerLink: "https://sepolia.etherscan.io/tx/0xabc" };
    };
    await send({ type: "callback", data: callbackData("ap", largeStage), from: client }, release);
    await send({ type: "callback", data: callbackData("ap", largeStage), from: client }, release);
    expect(calls).toBe(1);
    const paid = await db.select().from(payments).where(eq(payments.idempotencyKey, `bot-approve:${largeStage}`));
    expect(paid).toHaveLength(1);
    await db.update(stages).set({ status: "awaiting_client_approval" }).where(eq(stages.id, smallStage));
    const failed = await send(
      { type: "callback", data: callbackData("ap", smallStage), from: client },
      async () => ({ ok: false as const, reason: "network" }),
    );
    expect(textOf(failed)).toContain("didn't go through yet");
    const retryJobs = await db.select().from(jobs).where(eq(jobs.dedupeKey, `bot-approve:${smallStage}`));
    expect(retryJobs).toHaveLength(1);
    expect(retryJobs[0]?.kind).toBe("release_retry");
    expect(retryJobs[0]?.payload).toMatchObject({ idempotencyKey: `bot-approve:${smallStage}` });
    let second = 0;
    await send({ type: "callback", data: callbackData("ap", smallStage), from: client }, async () => {
      second += 1;
      return { ok: true, explorerLink: "https://sepolia.etherscan.io/tx/0xdef" };
    });
    expect(second).toBe(0);
    expect(await db.select().from(jobs).where(eq(jobs.dedupeKey, `bot-approve:${smallStage}`))).toHaveLength(1);
    const blocked = await send({ type: "callback", data: callbackData("ap", smallStage), from: contractor });
    expect(textOf(blocked)).toBe("Only the client can do this on Plot 14 Lekki.");
    const under = await send({ type: "callback", data: callbackData("dc", smallStage), from: client });
    expect(textOf(under)).toContain("Why are you declining");
    const declined = await send({ type: "text", text: "The photos do not match the slab", from: client });
    expect(textOf(declined)).toContain("was declined");
  });

  it("opens a dispute and a variation", async () => {
    await db.update(stages).set({ status: "in_progress" }).where(eq(stages.id, largeStage));
    const ask = await send({ type: "callback", data: callbackData("di", largeStage), from: client });
    expect(textOf(ask)).toContain("Why are you disputing stage");
    await send({ type: "text", text: "The roof sheet is the wrong gauge", from: client });
    const opened = await send({ type: "command", command: "done", arg: "", from: client });
    expect(textOf(opened)).toContain("Dispute opened");
    const decision = await send({ type: "command", command: "review", arg: "", from: consultant });
    void decision;
    const list = await send({ type: "callback", data: callbackData("go", "disputes"), from: consultant });
    expect(textOf(list)).toContain("yours to decide");
    await send({ type: "callback", data: callbackData("go", "change"), from: contractor });
    await send({ type: "text", text: "Add a second soakaway", from: contractor });
    await send({ type: "text", text: "250000", from: contractor });
    const summary = await send({ type: "callback", data: callbackData("vs", "new"), from: contractor });
    expect(textOf(summary)).toContain("Add a second soakaway");
    const sent = await send({ type: "callback", data: callbackData("vg", "send"), from: contractor });
    const changeId = sent.edit?.keyboard?.[0]?.[0] && sent.edit.keyboard[0][0].kind === "callback" ? sent.edit.keyboard[0][0].data.split(":")[2] : "";
    expect(changeId).toBeTruthy();
    const agreed = await send({ type: "callback", data: callbackData("va", changeId ?? ""), from: client });
    expect(textOf(agreed)).toContain("Change agreed");
    const added = (await db.select().from(stages).where(eq(stages.projectId, projectId))).find((stage) => stage.name === "Add a second soakaway");
    expect(added?.amountNgnKobo).toBe(25_000_000n);
  });

  it("shows wallet payments without a chain lecture", async () => {
    const view = await send({ type: "command", command: "wallet", arg: "", from: contractor });
    expect(textOf(view)).toContain("Cash out to bank: coming soon");
    expect(textOf(view).toLowerCase()).not.toContain("blockchain");
    const details = await send({ type: "callback", data: callbackData("wt", "show"), from: contractor });
    expect(textOf(details)).toContain("0x1111111111111111111111111111111111111111");
    const help = await send({ type: "command", command: "help", arg: "", from: client });
    expect(textOf(help)).toContain("/menu");
    expect(textOf(help)).not.toContain("support@example.com");
    const denied = await send({ type: "command", command: "wallet", arg: "", from: client });
    expect(textOf(denied)).toContain("Only the contractor can do this");
  });

  it("switches the active project", async () => {
    const list = await send({ type: "command", command: "projects", arg: "", from: client });
    expect(labels(list).join(" ")).toContain("Plot 14");
    const [otherUser] = await db.insert(users).values({ telegramId: 7401n, name: "Other" }).returning();
    const [otherWs] = await db.insert(workspaces).values({ ownerUserId: otherUser!.id, name: "Other", company: "Other" }).returning();
    const [secret] = await db
      .insert(projects)
      .values({
        workspaceId: otherWs!.id,
        name: "Secret tower",
        siteLocation: "Abuja",
        siteLat: 9,
        siteLng: 7,
        geofenceRadiusM: 50,
        fxRateLocked: 100n,
        fxSource: "test",
        spendingCapUsdc: 1n,
        retentionBps: 0,
        defectsPeriodDays: 1,
        contractSumKobo: 1n,
        contractSumUsdc: 1n,
      })
      .returning();
    const switched = await send({ type: "callback", data: callbackData("sw", secret!.id), from: client });
    expect(textOf(switched)).toContain("expired");
    expect(textOf(list)).not.toContain("Secret tower");
  });
});

void clientId;
void contractorId;
void contractVersions;
void memberships;
void users;
