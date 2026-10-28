import {
  createMemoryDatabase,
  issueJoinCode,
  memberships,
  parties,
  redeemJoinCode,
  revokeJoinCode,
  startOwnProject,
} from "@certa/db";
import { codeFromInvite, parseStartPayload } from "@certa/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { FORBIDDEN } from "../auth/errors.js";
import { inviteFixedRole } from "./selfServe.js";

delete process.env.DATABASE_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

describe("self-serve projects with side-based invite links", () => {
  it("gives the creator the chosen side and the joiner the opposite side", async () => {
    const { db, close } = await createMemoryDatabase();
    const client = await startOwnProject(db, {
      telegramId: 88001n,
      name: "Ada",
      projectName: "Lekki gatehouse",
      role: "client",
    });
    expect((await db.select().from(memberships).where(eq(memberships.userId, client.userId))).map((row) => row.role)).toEqual([
      "client",
    ]);
    expect(client.inviteRole).toBe("contractor");
    const link = `https://t.me/CertaApp_bot?start=${client.inviteCode}`;
    const payload = parseStartPayload(new URL(link).searchParams.get("start") ?? "");
    expect(payload).toEqual({ kind: "join", code: client.inviteCode });
    expect(codeFromInvite(link)).toBe(client.inviteCode);

    const joined = await redeemJoinCode(db, { telegramId: 88002n, name: "Kunle", code: client.inviteCode });
    expect(joined).toMatchObject({ ok: true, role: "contractor", projectName: "Lekki gatehouse" });
    if (!joined.ok) throw new Error("expected join");
    const joiner = await db.select().from(parties).where(eq(parties.id, joined.partyId));
    expect(joiner[0]?.role).toBe("main_contractor");

    const contractor = await startOwnProject(db, {
      telegramId: 88003n,
      name: "Kunle",
      projectName: "Ikeja extension",
      role: "contractor",
    });
    expect((await db.select().from(memberships).where(eq(memberships.userId, contractor.userId))).map((row) => row.role)).toEqual([
      "contractor",
    ]);
    const other = await redeemJoinCode(db, { telegramId: 88004n, name: "Ministry", code: contractor.inviteCode });
    expect(other).toMatchObject({ ok: true, role: "client", projectName: "Ikeja extension" });
    await close();
  });

  it("rejects a reused, expired, revoked, or wrong-project code, and a filled side", async () => {
    const { db, close } = await createMemoryDatabase();
    const started = await startOwnProject(db, {
      telegramId: 88011n,
      name: "Ada",
      projectName: "Gatehouse",
      role: "client",
    });
    const other = await startOwnProject(db, {
      telegramId: 88012n,
      name: "Bola",
      projectName: "Other site",
      role: "client",
    });

    const wrong = await redeemJoinCode(db, {
      telegramId: 88013n,
      name: "Wrong",
      code: started.inviteCode,
      projectId: other.projectId,
    });
    expect(wrong).toEqual({ ok: false, reason: "invalid" });
    expect(await redeemJoinCode(db, { telegramId: 88014n, name: "Kunle", code: started.inviteCode })).toMatchObject({
      ok: true,
      role: "contractor",
    });
    expect(await redeemJoinCode(db, { telegramId: 88015n, name: "Again", code: started.inviteCode })).toEqual({
      ok: false,
      reason: "invalid",
    });

    const expired = await issueJoinCode(db, {
      projectId: other.projectId,
      workspaceId: other.workspaceId,
      role: "main_contractor",
      code: "EXPIRED1",
      ttlMs: -1_000,
    });
    expect(await redeemJoinCode(db, { telegramId: 88016n, name: "Late", code: expired.code })).toEqual({
      ok: false,
      reason: "expired",
    });

    const revocable = await issueJoinCode(db, {
      projectId: other.projectId,
      workspaceId: other.workspaceId,
      role: "main_contractor",
      code: "REVOKED1",
    });
    expect(await revokeJoinCode(db, { projectId: other.projectId, code: revocable.code })).toBe(true);
    expect(await revokeJoinCode(db, { projectId: started.projectId, code: revocable.code })).toBe(false);
    expect(await redeemJoinCode(db, { telegramId: 88017n, name: "Revoked", code: revocable.code })).toEqual({
      ok: false,
      reason: "revoked",
    });

    const third = await issueJoinCode(db, {
      projectId: started.projectId,
      workspaceId: started.workspaceId,
      role: "main_contractor",
      code: "THIRD001",
    });
    expect(await redeemJoinCode(db, { telegramId: 88018n, name: "Third", code: third.code })).toEqual({
      ok: false,
      reason: "taken",
    });
    const still = await db.select().from(memberships).where(eq(memberships.projectId, started.projectId));
    expect(still.filter((row) => row.role === "contractor")).toHaveLength(1);
    await close();
  });

  it("lets only a client or contractor invite a consultant, and not onto a filled role", async () => {
    const { db, close } = await createMemoryDatabase();
    const started = await startOwnProject(db, {
      telegramId: 88021n,
      name: "Ada",
      projectName: "Gatehouse",
      role: "client",
    });
    const open = await inviteFixedRole(db, {
      userId: started.userId,
      projectId: started.projectId,
      role: "consultant",
      botUsername: "CertaApp_bot",
    });
    expect(open.ok).toBe(true);
    if (!open.ok) throw new Error("expected consultant invite");
    const joined = await redeemJoinCode(db, { telegramId: 88022n, name: "Seyi", code: open.code });
    expect(joined).toMatchObject({ ok: true, role: "consultant" });
    const again = await inviteFixedRole(db, {
      userId: started.userId,
      projectId: started.projectId,
      role: "consultant",
      botUsername: "CertaApp_bot",
    });
    expect(again).toEqual({ ok: false, message: "That role is already filled." });
    if (!joined.ok) throw new Error("expected consultant");
    const consultant = (await db.select().from(parties).where(eq(parties.id, joined.partyId)))[0];
    await expect(
      inviteFixedRole(db, {
        userId: consultant?.userId ?? "",
        projectId: started.projectId,
        role: "subcontractor",
        botUsername: "CertaApp_bot",
      }),
    ).rejects.toBe(FORBIDDEN);

    const builder = await startOwnProject(db, {
      telegramId: 88023n,
      name: "Kunle",
      projectName: "Builder site",
      role: "contractor",
    });
    const fromContractor = await inviteFixedRole(db, {
      userId: builder.userId,
      projectId: builder.projectId,
      role: "subcontractor",
      botUsername: "CertaApp_bot",
    });
    expect(fromContractor.ok).toBe(true);
    await close();
  });
});
