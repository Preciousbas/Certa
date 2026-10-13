import { describe, expect, it } from "vitest";
import { authorize, type Principal } from "./policy.js";

const projectA = { type: "project" as const, projectId: "proj-a", workspaceId: "ws-a" };
const projectB = { type: "project" as const, projectId: "proj-b", workspaceId: "ws-b" };
const stageA = {
  type: "stage" as const,
  projectId: "proj-a",
  workspaceId: "ws-a",
  assignedPartyId: "party-sub",
};
const stageOtherSub = { ...stageA, assignedPartyId: "party-other" };

function user(partial: Partial<Principal> & Pick<Principal, "userId">): Principal {
  return { memberships: [], parties: [], ...partial };
}

describe("authorize", () => {
  const client = user({
    userId: "user-client",
    memberships: [{ workspaceId: "ws-a", role: "owner" }],
    parties: [
      { partyId: "party-client", projectId: "proj-a", workspaceId: "ws-a", role: "client", canViewSubs: false },
    ],
  });
  const sub = user({
    userId: "user-sub",
    parties: [
      { partyId: "party-sub", projectId: "proj-a", workspaceId: "ws-a", role: "subcontractor", canViewSubs: false },
    ],
  });
  const main = user({
    userId: "user-main",
    parties: [
      { partyId: "party-main", projectId: "proj-a", workspaceId: "ws-a", role: "main_contractor", canViewSubs: false },
    ],
  });
  const mainViewer = user({
    userId: "user-main-2",
    parties: [
      { partyId: "party-main-2", projectId: "proj-a", workspaceId: "ws-a", role: "main_contractor", canViewSubs: true },
    ],
  });

  it("stops user A reading project B", () => {
    expect(authorize(client, "project.read", projectB)).toBe(false);
    expect(authorize(sub, "project.read", projectB)).toBe(false);
    expect(authorize(client, "document.read", projectB)).toBe(false);
  });

  it("lets a subcontractor read only their own stage", () => {
    expect(authorize(sub, "project.read", projectA)).toBe(true);
    expect(authorize(sub, "stage.read", stageA)).toBe(true);
    expect(authorize(sub, "stage.read", stageOtherSub)).toBe(false);
    expect(authorize(sub, "submission.create", stageA)).toBe(true);
    expect(authorize(sub, "project.write", projectA)).toBe(false);
    expect(authorize(sub, "change.propose", projectA)).toBe(false);
    expect(authorize(sub, "change.respond", projectA)).toBe(true);
  });

  it("hides subcontractor stages from a main contractor unless can_view_subs is set", () => {
    expect(authorize(main, "stage.read", stageA)).toBe(false);
    expect(authorize(mainViewer, "stage.read", stageA)).toBe(true);
  });

  it("lets the client propose changes and not the other workspace", () => {
    expect(authorize(client, "change.propose", projectA)).toBe(true);
    expect(authorize(client, "project.write", projectB)).toBe(false);
  });
});
