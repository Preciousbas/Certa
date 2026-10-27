import { describe, expect, it } from "vitest";
import { ACTIONS, MATRIX, ROLES, allows, type Action, type Role } from "./matrix.js";

describe("permission matrix", () => {
  it("covers every role and every action", () => {
    expect(ROLES).toHaveLength(5);
    expect(ACTIONS.length * ROLES.length).toBe(95);
    for (const action of ACTIONS) {
      for (const role of ROLES) {
        const cell = MATRIX[action][role];
        if (cell === "allow") expect(allows(role, action)).toBe(true);
        if (cell === "deny") expect(allows(role, action)).toBe(false);
        if (cell === "own_stages" || cell === "assigned") {
          expect(allows(role, action, { assigned: false })).toBe(false);
          expect(allows(role, action, { assigned: true })).toBe(true);
        }
      }
    }
  });

  it("keeps the consultant to upload, and the two sides of a variation apart", () => {
    const consultant: Role = "consultant";
    const upload: Action = "upload_documents";
    const edit: Action = "edit_draft_stages";
    expect(allows(consultant, upload)).toBe(true);
    expect(allows(consultant, edit)).toBe(false);
    expect(allows("client", "accept_variation_from_contractor")).toBe(true);
    expect(allows("contractor", "accept_variation_from_contractor")).toBe(false);
    expect(allows("contractor", "accept_variation_from_client")).toBe(true);
    expect(allows("client", "accept_variation_from_client")).toBe(false);
  });
});
