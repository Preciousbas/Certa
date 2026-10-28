import { createMemoryDatabase, joinAttempts, redeemJoinCode, startOwnProject } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { handleIncoming } from "./engine.js";

describe("join and re-join", () => {
  it("treats a second tap of your own link as already in", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 21n, name: "Ada", projectName: "Plot 14", role: "client" });
    const first = await handleIncoming(opened.db, { type: "command", command: "join", arg: created.inviteCode, from: { id: 22, firstName: "Kemfor" } }, { botUsername: "CertaApp_bot" });
    const again = await handleIncoming(opened.db, { type: "command", command: "join", arg: created.inviteCode, from: { id: 22, firstName: "Kemfor" } }, { botUsername: "CertaApp_bot" });
    const text = again.messages.map((message) => message.text).join("\n");
    expect(text).toContain("You're already in Plot 14 as contractor");
    expect(first.messages.map((message) => message.text).join("\n")).toContain("You're in");
    const attempts = await opened.db.select().from(joinAttempts).where(eq(joinAttempts.telegramId, 22n));
    expect(attempts).toHaveLength(0);
    await opened.close();
  });

  it("refuses a second role for the same person and leaves the seat open", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 31n, name: "Ada", projectName: "Plot 14", role: "contractor" });
    const client = await redeemJoinCode(opened.db, { telegramId: 32n, name: "Ada", code: created.inviteCode });
    expect(client.ok).toBe(true);
    const other = await startOwnProject(opened.db, { telegramId: 33n, name: "Kemfor", projectName: "Other", role: "client" });
    void other;
    const { createInvite } = await import("../server/projects/selfServe.js");
    if (!client.ok) throw new Error("join");
    const invite = await createInvite(opened.db, { userId: created.userId, projectId: created.projectId, role: "consultant", botUsername: "CertaApp_bot" });
    if (!invite.ok) throw new Error(invite.message);
    const crossed = await handleIncoming(opened.db, { type: "command", command: "join", arg: invite.code, from: { id: 32, firstName: "Ada" } }, {});
    expect(crossed.messages.map((message) => message.text).join("\n")).toContain("One person can't hold two roles");
    const redeemed = await redeemJoinCode(opened.db, { telegramId: 34n, name: "Okafor", code: invite.code });
    expect(redeemed.ok).toBe(true);
    await opened.close();
  });
});
