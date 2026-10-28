import { contractVersions, createMemoryDatabase, issueJoinCode, joinCodes, memberships, notifications, projects, stages, startOwnProject, users, wallets } from "@certa/db";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { inviteRoleKeyboard } from "../../bot/keyboards.js";
import { bAp4 } from "../../bot/messages.js";
import { beginInvite, chooseApprovalMode } from "../../bot/flows/actions.js";
import { nextStep } from "../../bot/flows/next.js";
import { lockReadiness } from "../chain/readiness.js";
import { projectRoleWallets } from "../chain/flows.js";
import type { ChainPort, Hex } from "../chain/port.js";
import { approverLine, setApprovalMode } from "./approvalMode.js";
import { recordCaptureOutcome } from "../stages/transition.js";
import { notifyVerdict } from "../verify/notify.js";
import { applyAiOverride } from "../verify/override.js";
import { finishDispute } from "../../bot/flows/actions.js";

function quietPort(): ChainPort {
  return {
    async simulate() { return { ok: true as const }; },
    async send() { return { hash: `0x${"ab".repeat(32)}` as Hex, nonce: 1n }; },
    async receipt() { return { status: "success" as const, blockNumber: 1n, confirmations: 2, logs: [] }; },
    async ethBalance() { return 10n ** 18n; },
    async pendingNonce() { return 1; },
    async quoteFund() { return 1_000_000n; },
    async erc20Balance() { return 5_000_000n; },
    async allowance() { return 0n; },
    async escrowSnapshot() { return { clientAccepted: true, contractorAccepted: true, stages: [], tokenBalance: 0n, totalFunded: 0n, totalOut: 0n }; },
  };
}

async function projectOf(db: Awaited<ReturnType<typeof createMemoryDatabase>>["db"], projectId: string) {
  const row = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
  if (!row) throw new Error("project missing");
  return row;
}

describe("approval mode", () => {
  it("offers skip only while the mode is unset, and a client skip revokes a consultant code", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 701n, name: "Ada", projectName: "Plot", role: "client" });
    const project = await projectOf(opened.db, created.projectId);
    expect(project.approvalMode).toBeNull();
    const labels = inviteRoleKeyboard(["contractor", "consultant"], { offerSkip: true, projectId: project.id }).flat().map((button) => button.text);
    expect(labels).toContain("No consultant, skip");
    expect(inviteRoleKeyboard(["contractor"]).flat().map((button) => button.text)).not.toContain("No consultant, skip");
    const actor = {
      telegramId: 701n,
      firstName: "Ada",
      userId: created.userId,
      fromId: 701,
      userName: "ada",
      project,
      role: "client",
      session: { step: null, projectId: project.id, data: {}, expiresAt: null },
    };
    const invited = await beginInvite(opened.db, actor);
    expect(invited.messages[0]?.keyboard?.flat().some((button) => button.text === "No consultant, skip")).toBe(true);
    await issueJoinCode(opened.db, { projectId: project.id, workspaceId: created.workspaceId, role: "consultant" });
    const skipped = await chooseApprovalMode(opened.db, actor, "client");
    expect(skipped.messages[0]?.text).toContain("OK. No consultant on");
    expect(skipped.messages[0]?.text).not.toContain("invite the consultant");
    const stored = (await opened.db.select().from(joinCodes)).find((row) => row.projectId === project.id && row.role === "consultant");
    expect(stored?.revokedAt).toBeTruthy();
    const after = await projectOf(opened.db, project.id);
    expect(after.approvalMode).toBe("client");
    const lockedKeyboard = await beginInvite(opened.db, { ...actor, project: after });
    expect(lockedKeyboard.messages[0]?.keyboard?.flat().some((button) => button.text === "No consultant, skip")).toBe(false);
    await opened.close();
  });

  it("lets a client-mode project lock without a consultant, and keeps the consultant wallet in consultant mode", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 711n, name: "Ada", projectName: "Plot", role: "client" });
    const contractor = (await opened.db.insert(users).values({ telegramId: 712n, name: "Kemfor" }).returning())[0]!;
    await opened.db.insert(memberships).values({ projectId: created.projectId, userId: contractor.id, role: "contractor" });
    await opened.db.insert(contractVersions).values({
      projectId: created.projectId, version: 1, status: "accepted", contractSumKobo: 100n, koboPerUsdc: 1n, fxSource: "test", fxAsOf: "2026-10-01", spendingCapMicro: 1_000_000n, terms: {}, documentHashes: [], contentHash: "abc", createdBy: created.userId,
    });
    await opened.db.insert(stages).values({
      projectId: created.projectId, workspaceId: created.workspaceId, stageIndex: 0, onChainIdx: 0, name: "One", amountNgnKobo: 100n, amountUsdc: 1_000_000n, retentionBps: 0,
    });
    const port = quietPort();
    const missing = await lockReadiness(opened.db, { projectId: created.projectId, upToStage: 0 }, port);
    expect(missing.code).toBe("people_missing");
    expect(missing.message).toBe("Choose whether this project has a consultant.");
    expect(await nextStep(opened.db, created.projectId, created.userId, "client")).toBe("Next: invite a consultant, or tap No consultant, skip.");
    const waiting = await setApprovalMode(opened.db, { userId: created.userId, projectId: created.projectId, mode: "client" });
    expect(waiting.ok && "waiting" in waiting && waiting.waiting).toBeTruthy();
    const agreed = await setApprovalMode(opened.db, { userId: contractor.id, projectId: created.projectId, mode: "client", agreed: true });
    expect(agreed.ok).toBe(true);
    const ready = await lockReadiness(opened.db, { projectId: created.projectId, upToStage: 0 }, port);
    expect(ready.code).not.toBe("people_missing");
    expect(await nextStep(opened.db, created.projectId, created.userId, "client")).not.toContain("consultant");
    const roles = await projectRoleWallets(opened.db, created.projectId);
    const placeholder = (await opened.db.select().from(wallets)).find((row) => row.address === roles.consultant.address);
    expect(placeholder?.userId).toBeNull();
    expect(roles.consultant.address).not.toBe(roles.client.address);
    expect(roles.consultant.address).not.toBe(roles.contractor.address);
    expect(roles.consultant.address).not.toBe(roles.operator.address);
    await opened.db.update(projects).set({ approvalMode: "consultant" }).where(eq(projects.id, created.projectId));
    const consultant = (await opened.db.insert(users).values({ telegramId: 713n, name: "Okafor" }).returning())[0]!;
    await opened.db.insert(memberships).values({ projectId: created.projectId, userId: consultant.id, role: "consultant" });
    const consultantRoles = await projectRoleWallets(opened.db, created.projectId);
    const consultantWallet = (await opened.db.select().from(wallets)).find((row) => row.address === consultantRoles.consultant.address);
    expect(consultantWallet?.userId).toBe(consultant.id);
    await opened.close();
  });

  it("labels a client approval without naming a consultant", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 721n, name: "Ada", projectName: "Plot", role: "client" });
    const [stage] = await opened.db.insert(stages).values({
      projectId: created.projectId, workspaceId: created.workspaceId, stageIndex: 0, onChainIdx: 0, name: "One", amountNgnKobo: 100n, amountUsdc: 1_000_000n, retentionBps: 0, status: "released",
    }).returning();
    const { approvals } = await import("@certa/db");
    await opened.db.insert(approvals).values({
      projectId: created.projectId, workspaceId: created.workspaceId, stageId: stage!.id, byUserId: created.userId, decision: "approved",
    });
    const line = await approverLine(opened.db, stage!);
    expect(line).toBe("Approved by the client (no consultant)");
    expect(bAp4({ amount: "₦100.00", contractor: "Kemfor", n: 1, stage: "One", explorerLink: "https://sepolia.etherscan.io/tx/0xabc", approvedBy: line })).toContain("Approved by the client (no consultant).");
    expect(line).not.toContain("the consultant");
    await opened.close();
  });

  it("refuses skip after lock or with a consultant, and waits for the contractor after acceptance", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 731n, name: "Ada", projectName: "Plot", role: "client" });
    const contractor = (await opened.db.insert(users).values({ telegramId: 732n, name: "Kemfor" }).returning())[0]!;
    await opened.db.insert(memberships).values({ projectId: created.projectId, userId: contractor.id, role: "contractor" });
    await opened.db.update(projects).set({ escrowAddress: "0x1111111111111111111111111111111111111111" }).where(eq(projects.id, created.projectId));
    const locked = await setApprovalMode(opened.db, { userId: created.userId, projectId: created.projectId, mode: "client" });
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.message).toContain("Money is already locked");
    await opened.db.update(projects).set({ escrowAddress: null }).where(eq(projects.id, created.projectId));
    const consultant = (await opened.db.insert(users).values({ telegramId: 733n, name: "Okafor" }).returning())[0]!;
    await opened.db.insert(memberships).values({ projectId: created.projectId, userId: consultant.id, role: "consultant" });
    const joined = await setApprovalMode(opened.db, { userId: created.userId, projectId: created.projectId, mode: "client" });
    expect(joined.ok).toBe(false);
    if (!joined.ok) expect(joined.message).toContain("Okafor has joined as consultant");
    await opened.db.delete(memberships).where(eq(memberships.userId, consultant.id));
    const pendingProject = await startOwnProject(opened.db, { telegramId: 734n, name: "Ada", projectName: "Pending", role: "client" });
    const [version] = await opened.db.insert(contractVersions).values({
      projectId: pendingProject.projectId, version: 1, status: "pending_acceptance", contractSumKobo: 100n, koboPerUsdc: 1n, fxSource: "test", fxAsOf: "2026-10-01", spendingCapMicro: 1n, terms: {}, documentHashes: [], contentHash: "abc", createdBy: pendingProject.userId,
    }).returning();
    const pending = await setApprovalMode(opened.db, { userId: pendingProject.userId, projectId: pendingProject.projectId, mode: "client" });
    expect(pending.ok).toBe(true);
    const drafted = (await opened.db.select().from(contractVersions)).find((row) => row.id === version!.id);
    expect(drafted?.status).toBe("draft");
    const acceptedProject = await startOwnProject(opened.db, { telegramId: 735n, name: "Ada", projectName: "Accepted", role: "client" });
    const acceptedContractor = (await opened.db.insert(users).values({ telegramId: 736n, name: "Kemfor" }).returning())[0]!;
    await opened.db.insert(memberships).values({ projectId: acceptedProject.projectId, userId: acceptedContractor.id, role: "contractor" });
    await opened.db.insert(contractVersions).values({
      projectId: acceptedProject.projectId, version: 1, status: "accepted", contractSumKobo: 100n, koboPerUsdc: 1n, fxSource: "test", fxAsOf: "2026-10-01", spendingCapMicro: 1n, terms: {}, documentHashes: [], contentHash: "abc", createdBy: acceptedProject.userId,
    });
    const waiting = await setApprovalMode(opened.db, { userId: acceptedProject.userId, projectId: acceptedProject.projectId, mode: "client" });
    expect(waiting.ok && "waiting" in waiting && waiting.waiting).toBeTruthy();
    expect((await projectOf(opened.db, acceptedProject.projectId)).approvalMode).toBeNull();
    const agreed = await setApprovalMode(opened.db, { userId: acceptedContractor.id, projectId: acceptedProject.projectId, mode: "client", agreed: true });
    expect(agreed.ok).toBe(true);
    expect((await projectOf(opened.db, acceptedProject.projectId)).approvalMode).toBe("client");
    const told = await opened.db.select().from(notifications);
    expect(told.some((row) => JSON.stringify(row.payload).includes("wants to run this project without a consultant"))).toBe(true);
    await opened.close();
  });

  it("backfills an active consultant and leaves a project without one unset", async () => {
    const opened = await createMemoryDatabase();
    const withConsultant = await startOwnProject(opened.db, { telegramId: 741n, name: "Ada", projectName: "With", role: "client" });
    const without = await startOwnProject(opened.db, { telegramId: 742n, name: "Ada", projectName: "Without", role: "client" });
    const consultant = (await opened.db.insert(users).values({ telegramId: 743n, name: "Okafor" }).returning())[0]!;
    await opened.db.insert(memberships).values({ projectId: withConsultant.projectId, userId: consultant.id, role: "consultant" });
    await opened.db.update(projects).set({ approvalMode: null, approvalModeSetAt: null }).where(eq(projects.id, withConsultant.projectId));
    await opened.db.execute(sql`
      UPDATE projects p SET approval_mode = 'consultant', approval_mode_set_at = now()
      WHERE approval_mode IS NULL AND EXISTS (
        SELECT 1 FROM memberships m WHERE m.project_id = p.id AND m.role = 'consultant' AND m.status = 'active')
    `);
    expect((await projectOf(opened.db, withConsultant.projectId)).approvalMode).toBe("consultant");
    expect((await projectOf(opened.db, without.projectId)).approvalMode).toBeNull();
    await opened.close();
  });

  it("sends a pass to the client, records a client override, and flags a dispute", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 751n, name: "Ada", projectName: "Plot", role: "client" });
    const contractor = (await opened.db.insert(users).values({ telegramId: 752n, name: "Kemfor" }).returning())[0]!;
    await opened.db.insert(memberships).values({ projectId: created.projectId, userId: contractor.id, role: "contractor" });
    await setApprovalMode(opened.db, { userId: created.userId, projectId: created.projectId, mode: "client" });
    const [stage] = await opened.db.insert(stages).values({
      projectId: created.projectId, workspaceId: created.workspaceId, stageIndex: 0, onChainIdx: 0, name: "Foundation", amountNgnKobo: 100n, amountUsdc: 1_000_000n, retentionBps: 0, status: "not_started",
    }).returning();
    await recordCaptureOutcome(opened.db, stage!.id, { pass: true, releasedOnChain: false });
    const passed = (await opened.db.select().from(stages).where(eq(stages.id, stage!.id)))[0];
    expect(passed?.status).toBe("awaiting_client_approval");
    await notifyVerdict(opened.db, ["B-VF-1", "B-VF-3"], {
      clientReviews: true,
      projectId: created.projectId,
      projectName: "Plot",
      submissionId: stage!.id,
      stageId: stage!.id,
      stageNumber: 1,
      stageName: "Foundation",
      amountKobo: 100n,
      confidencePct: 87,
      reasons: ["The work matches the stage."],
      issues: [],
      missingShots: [],
      safetyFlags: [],
      amountUsdc: 1_000_000n,
      retentionBps: 0,
    });
    const notes = await opened.db.select().from(notifications);
    const clientNote = notes.find((row) => row.userId === created.userId);
    expect(JSON.stringify(clientNote?.payload)).toContain("advice only");
    expect(JSON.stringify(clientNote?.payload)).not.toContain("the consultant");
    expect(notes.some((row) => row.userId === contractor.id && JSON.stringify(row.payload).includes("The client will now review"))).toBe(true);
    await opened.db.update(stages).set({ status: "ai_fail" }).where(eq(stages.id, stage!.id));
    await applyAiOverride(opened.db, {
      projectId: created.projectId,
      workspaceId: created.workspaceId,
      stageId: stage!.id,
      userId: created.userId,
      reason: "The photos are enough for the client to approve this stage.",
      submit: async () => ({ txHash: null }),
    });
    const { approvals } = await import("@certa/db");
    const override = (await opened.db.select().from(approvals).where(eq(approvals.stageId, stage!.id)))[0];
    expect(override?.decision).toBe("client_override");
    const project = await projectOf(opened.db, created.projectId);
    const actor = {
      telegramId: 752n,
      firstName: "Kemfor",
      userId: contractor.id,
      fromId: 752,
      userName: "kemfor",
      project,
      role: "contractor",
      session: { step: "dispute_photos", projectId: project.id, data: { stageId: stage!.id, reason: "The client declined a finished stage." }, expiresAt: null },
    };
    await opened.db.update(stages).set({ status: "in_progress" }).where(eq(stages.id, stage!.id));
    const openedDispute = await finishDispute(opened.db, actor, new Date());
    expect(openedDispute.messages[0]?.text).toContain("There's no consultant on this project");
    const { disputes } = await import("@certa/db");
    const dispute = (await opened.db.select().from(disputes).where(eq(disputes.stageId, stage!.id)))[0];
    expect(dispute?.resolution).toMatchObject({ noConsultant: true });
    const disputeNotes = (await opened.db.select().from(notifications)).filter((row) => JSON.stringify(row.payload).includes("B-DI-2") || JSON.stringify(row.payload).includes("no consultant"));
    expect(disputeNotes.some((row) => JSON.stringify(row.payload).includes("B-DI-2"))).toBe(false);
    await opened.close();
  });
});
