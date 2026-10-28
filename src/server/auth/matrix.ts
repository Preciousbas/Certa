export const ROLES = ["client", "consultant", "contractor", "subcontractor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "view_project",
  "upload_documents",
  "edit_draft_stages",
  "send_contract",
  "accept_contract_client_side",
  "accept_contract_contractor_side",
  "fund_escrow",
  "submit_stage_photos",
  "certify_stage",
  "approve_release",
  "open_dispute",
  "decide_dispute",
  "propose_variation",
  "accept_variation_from_contractor",
  "accept_variation_from_client",
  "invite_settings_pause",
  "invite_extra",
  "view_audit_log",
  "set_approval_mode",
] as const;

export type Action = (typeof ACTIONS)[number];

/** `own_stages` and `assigned` are allowed only when the stage is assigned to that user. */
export type Cell = "allow" | "deny" | "own_stages" | "assigned";

export const MATRIX: Record<Action, Record<Role, Cell>> = {
  view_project: {
    client: "allow",
    consultant: "allow",
    contractor: "allow",
    subcontractor: "own_stages",
    viewer: "allow",
  },
  upload_documents: {
    client: "allow",
    consultant: "allow",
    contractor: "deny",
    subcontractor: "deny",
    viewer: "deny",
  },
  edit_draft_stages: {
    client: "allow",
    consultant: "deny",
    contractor: "deny",
    subcontractor: "deny",
    viewer: "deny",
  },
  send_contract: {
    client: "allow",
    consultant: "deny",
    contractor: "deny",
    subcontractor: "deny",
    viewer: "deny",
  },
  accept_contract_client_side: {
    client: "allow",
    consultant: "deny",
    contractor: "deny",
    subcontractor: "deny",
    viewer: "deny",
  },
  accept_contract_contractor_side: {
    client: "deny",
    consultant: "deny",
    contractor: "allow",
    subcontractor: "deny",
    viewer: "deny",
  },
  fund_escrow: {
    client: "allow",
    consultant: "deny",
    contractor: "deny",
    subcontractor: "deny",
    viewer: "deny",
  },
  submit_stage_photos: {
    client: "deny",
    consultant: "deny",
    contractor: "allow",
    subcontractor: "assigned",
    viewer: "deny",
  },
  certify_stage: {
    client: "deny",
    consultant: "allow",
    contractor: "deny",
    subcontractor: "deny",
    viewer: "deny",
  },
  approve_release: {
    client: "allow",
    consultant: "deny",
    contractor: "deny",
    subcontractor: "deny",
    viewer: "deny",
  },
  open_dispute: {
    client: "allow",
    consultant: "deny",
    contractor: "allow",
    subcontractor: "deny",
    viewer: "deny",
  },
  decide_dispute: {
    client: "deny",
    consultant: "allow",
    contractor: "deny",
    subcontractor: "deny",
    viewer: "deny",
  },
  propose_variation: {
    client: "allow",
    consultant: "allow",
    contractor: "allow",
    subcontractor: "deny",
    viewer: "deny",
  },
  accept_variation_from_contractor: {
    client: "allow",
    consultant: "deny",
    contractor: "deny",
    subcontractor: "deny",
    viewer: "deny",
  },
  accept_variation_from_client: {
    client: "deny",
    consultant: "deny",
    contractor: "allow",
    subcontractor: "deny",
    viewer: "deny",
  },
  invite_settings_pause: {
    client: "allow",
    consultant: "deny",
    contractor: "deny",
    subcontractor: "deny",
    viewer: "deny",
  },
  invite_extra: {
    client: "allow",
    consultant: "deny",
    contractor: "allow",
    subcontractor: "deny",
    viewer: "deny",
  },
  view_audit_log: {
    client: "allow",
    consultant: "allow",
    contractor: "deny",
    subcontractor: "deny",
    viewer: "deny",
  },
  set_approval_mode: {
    client: "allow",
    consultant: "deny",
    contractor: "deny",
    subcontractor: "deny",
    viewer: "deny",
  },
};

export function allows(role: Role, action: Action, ctx: { assigned?: boolean } = {}): boolean {
  const cell = MATRIX[action][role];
  if (cell === "allow") return true;
  if (cell === "own_stages" || cell === "assigned") return ctx.assigned === true;
  return false;
}

export function rolesFor(action: Action): Role[] {
  return ROLES.filter((role) => MATRIX[action][role] !== "deny");
}
