import { createMemoryDatabase, joinCodes, memberships, startOwnProject } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { inviteRoleKeyboard } from "../../bot/keyboards.js";
import { createInvite, invitableRoles } from "./selfServe.js";

describe("invitable roles", () => {
  it("lets the client and contractor invite only the open seats", () => {
    expect(invitableRoles("client", new Set())).toEqual(["contractor", "consultant", "subcontractor"]);
    expect(invitableRoles("contractor", new Set(["contractor"]))).toEqual(["client", "consultant", "subcontractor"]);
    expect(invitableRoles("contractor", new Set(["client", "contractor"]))).toEqual(["consultant", "subcontractor"]);
    expect(invitableRoles("consultant", new Set())).toEqual([]);
    expect(invitableRoles("client", new Set(["contractor", "consultant", "subcontractor"]))).toEqual([]);
  });

  it("builds the same buttons the web list would show", () => {
    const roles = invitableRoles("client", new Set(["client"]));
    const labels = inviteRoleKeyboard(roles).flat().map((button) => button.text);
    expect(labels).toEqual(["Contractor", "Consultant", "Subcontractor"]);
    expect(roles).toEqual(["contractor", "consultant", "subcontractor"]);
  });

  it("revokes the earlier unused code when the same role is invited again", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 11n, name: "Ada", projectName: "Plot", role: "client" });
    const first = await createInvite(opened.db, { userId: created.userId, projectId: created.projectId, role: "contractor", botUsername: "CertaApp_bot" });
    const second = await createInvite(opened.db, { userId: created.userId, projectId: created.projectId, role: "contractor", botUsername: "CertaApp_bot" });
    expect(first.ok && second.ok).toBe(true);
    const rows = await opened.db.select().from(joinCodes).where(eq(joinCodes.projectId, created.projectId));
    const revoked = rows.filter((row) => row.revokedAt);
    expect(revoked.length).toBeGreaterThan(0);
    const members = await opened.db.select().from(memberships).where(eq(memberships.projectId, created.projectId));
    expect(members.map((row) => row.role)).toEqual(["client"]);
    await opened.close();
  });
});
