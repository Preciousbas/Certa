import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createMemoryDatabase } from "./client.js";
import { botSessions, joinAttempts, joinCodes, memberships, parties } from "./schema.js";
import { issueJoinCode, partyRoleFor, redeemJoinCode, startOwnProject } from "./services.js";
import { sha256Hex } from "./crypto.js";

describe("join transaction", () => {
  it("rolls back a failed join, allows one contractor, and rejects a used code", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 9301n, name: "Ada", projectName: "Plot", role: "client" });
    const invite = await issueJoinCode(opened.db, {
      projectId: created.projectId,
      workspaceId: created.workspaceId,
      role: partyRoleFor("contractor"),
    });
    await opened.client.exec(`
      CREATE FUNCTION fail_membership() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'test failure';
      END $$;
      CREATE TRIGGER fail_membership BEFORE INSERT ON memberships FOR EACH ROW EXECUTE FUNCTION fail_membership();
    `);
    await expect(
      redeemJoinCode(opened.db, { telegramId: 9302n, name: "Kemfor", code: invite.code }),
    ).rejects.toThrow(/insert into "memberships"/);
    const failedUserParties = (await opened.db.select().from(parties)).filter((row) => row.projectId === created.projectId);
    expect(failedUserParties.every((row) => row.userId === created.userId)).toBe(true);
    const codeRow = (await opened.db.select().from(joinCodes).where(eq(joinCodes.codeHash, sha256Hex(invite.code))))[0];
    expect(codeRow?.useCount).toBe(0);
    expect(await opened.db.select().from(botSessions).where(eq(botSessions.telegramId, 9302n))).toHaveLength(0);

    await opened.client.exec("DROP TRIGGER fail_membership ON memberships; DROP FUNCTION fail_membership();");
    const again = await redeemJoinCode(opened.db, { telegramId: 9302n, name: "Kemfor", code: invite.code });
    expect(again.ok).toBe(true);

    const secondProject = await startOwnProject(opened.db, { telegramId: 9310n, name: "Ada", projectName: "Gate", role: "client" });
    const first = await issueJoinCode(opened.db, {
      projectId: secondProject.projectId,
      workspaceId: secondProject.workspaceId,
      role: partyRoleFor("contractor"),
    });
    const second = await issueJoinCode(opened.db, {
      projectId: secondProject.projectId,
      workspaceId: secondProject.workspaceId,
      role: partyRoleFor("contractor"),
    });
    // PGlite uses one connection, so this checks the seat logic. FOR UPDATE is what serialises joins on real Postgres.
    const raced = await Promise.all([
      redeemJoinCode(opened.db, { telegramId: 9303n, name: "One", code: first.code }),
      redeemJoinCode(opened.db, { telegramId: 9304n, name: "Two", code: second.code }),
    ]);
    expect(raced.filter((row) => row.ok)).toHaveLength(1);
    expect(raced.filter((row) => !row.ok && row.reason === "taken")).toHaveLength(1);
    const contractors = (await opened.db.select().from(memberships)).filter(
      (row) => row.projectId === secondProject.projectId && row.role === "contractor" && row.status === "active",
    );
    expect(contractors).toHaveLength(1);

    const spent = await issueJoinCode(opened.db, {
      projectId: secondProject.projectId,
      workspaceId: secondProject.workspaceId,
      role: partyRoleFor("consultant"),
    });
    const spentRow = (await opened.db.select().from(joinCodes).where(eq(joinCodes.codeHash, sha256Hex(spent.code))))[0]!;
    await opened.db.update(joinCodes).set({ useCount: spentRow.maxUses }).where(eq(joinCodes.id, spentRow.id));
    const beforeParties = (await opened.db.select().from(parties)).length;
    const beforeMembers = (await opened.db.select().from(memberships)).length;
    const rejected = await redeemJoinCode(opened.db, { telegramId: 9305n, name: "Okafor", code: spent.code });
    expect(rejected).toEqual({ ok: false, reason: "invalid" });
    expect(await opened.db.select().from(parties)).toHaveLength(beforeParties);
    expect(await opened.db.select().from(memberships)).toHaveLength(beforeMembers);
    const attempts = (await opened.db.select().from(joinAttempts)).filter((row) => row.telegramId === 9305n);
    expect(attempts).toHaveLength(1);
    await opened.close();
  });
});
