import { changeRequests, getDatabase, memberships, startOwnProject, users } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { sealSession } from "../../../../src/server/auth/session";
import { proposeChange } from "./actions";

const jar = vi.hoisted(() => ({ token: "" }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "certa_session" && jar.token ? { value: jar.token } : undefined),
  }),
}));

process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars";

function form(): FormData {
  const data = new FormData();
  data.set("title", "Extra railing");
  data.set("description", "Add a steel railing along the stair flight.");
  data.set("type", "add");
  data.set("stageId", "new");
  data.set("amount", "250000");
  return data;
}

describe("proposeChange session", () => {
  it("writes nothing without a session, refuses a viewer or non-member, and lets a contractor send", async () => {
    const db = await getDatabase();
    const created = await startOwnProject(db, { telegramId: 9201n, name: "Ada", projectName: "Plot", role: "client" });
    const viewer = (await db.insert(users).values({ telegramId: 9202n, name: "Bisi" }).returning())[0]!;
    const outsider = (await db.insert(users).values({ telegramId: 9203n, name: "Tunde" }).returning())[0]!;
    const contractor = (await db.insert(users).values({ telegramId: 9204n, name: "Kemfor" }).returning())[0]!;
    await db.insert(memberships).values([
      { projectId: created.projectId, userId: viewer.id, role: "viewer" },
      { projectId: created.projectId, userId: contractor.id, role: "contractor" },
    ]);
    const mine = () => db.select().from(changeRequests).where(eq(changeRequests.projectId, created.projectId));

    jar.token = "";
    const signedOut = await proposeChange(form());
    expect(signedOut).toEqual({ ok: false, message: "Sign in from Telegram." });
    expect(await mine()).toHaveLength(0);

    jar.token = (await sealSession({ userId: viewer.id, telegramId: "9202" })).token;
    const viewed = await proposeChange(form());
    expect(viewed.ok).toBe(false);
    expect(viewed.message).toBe("Only the client or the contractor can propose a change.");

    jar.token = (await sealSession({ userId: outsider.id, telegramId: "9203" })).token;
    const stranger = await proposeChange(form());
    expect(stranger.ok).toBe(false);
    expect(stranger.message).toBe("Only the client or the contractor can propose a change.");
    expect(await mine()).toHaveLength(0);

    jar.token = (await sealSession({ userId: contractor.id, telegramId: "9204" })).token;
    const sent = await proposeChange(form());
    expect(sent).toEqual({ ok: true, message: "Sent to Ada for agreement. They have 72 hours to reply." });
    expect(await mine()).toHaveLength(1);
  });
});
