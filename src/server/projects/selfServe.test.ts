import { createMemoryDatabase, memberships, parties, redeemJoinCode, startOwnProject, workspaceMembers } from "@certa/db";
import { parseStartPayload } from "@certa/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { FORBIDDEN } from "../auth/errors.js";
import { inviteToProject } from "./selfServe.js";

delete process.env.DATABASE_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

describe("self-serve project start and invite links", () => {
  it("gives the creator the chosen membership and the joiner the invited role", async () => {
    const { db, close } = await createMemoryDatabase();
    const started = await startOwnProject(db, {
      telegramId: 88001n,
      name: "Ada",
      projectName: "Lekki gatehouse",
      role: "client",
    });
    const owner = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, started.userId));
    expect(owner[0]?.role).toBe("owner");
    const creator = await db.select().from(memberships).where(eq(memberships.userId, started.userId));
    expect(creator.map((row) => row.role)).toEqual(["client"]);
    const creatorParty = await db.select().from(parties).where(eq(parties.id, started.partyId));
    expect(creatorParty[0]?.role).toBe("client");

    const invite = await inviteToProject(db, {
      userId: started.userId,
      projectId: started.projectId,
      role: "contractor",
      botUsername: "CertaApp_bot",
    });
    expect(invite.link).toBe(`https://t.me/CertaApp_bot?start=${invite.code}`);
    const payload = parseStartPayload(new URL(invite.link).searchParams.get("start") ?? "");
    expect(payload).toEqual({ kind: "join", code: invite.code });
    if (payload.kind !== "join") throw new Error("expected join payload");

    const joined = await redeemJoinCode(db, { telegramId: 88002n, name: "Kunle", code: payload.code });
    expect(joined.ok).toBe(true);
    if (!joined.ok) throw new Error("expected join");
    const joinerParty = await db.select().from(parties).where(eq(parties.id, joined.partyId));
    expect(joinerParty[0]?.role).toBe("main_contractor");
    const joinerMembership = joinerParty[0]
      ? await db.select().from(memberships).where(eq(memberships.userId, joinerParty[0].userId))
      : [];
    expect(joinerMembership.map((row) => row.role)).toEqual(["contractor"]);
    await close();
  });

  it("refuses an invite when the creator's role cannot invite", async () => {
    const { db, close } = await createMemoryDatabase();
    const started = await startOwnProject(db, {
      telegramId: 88003n,
      name: "Kunle",
      projectName: "Ikeja extension",
      role: "contractor",
    });
    const creator = await db.select().from(memberships).where(eq(memberships.userId, started.userId));
    expect(creator[0]?.role).toBe("contractor");
    await expect(
      inviteToProject(db, {
        userId: started.userId,
        projectId: started.projectId,
        role: "contractor",
        botUsername: "CertaApp_bot",
      }),
    ).rejects.toBe(FORBIDDEN);
    await close();
  });
});
