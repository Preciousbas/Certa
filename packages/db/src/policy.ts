export type WorkspaceRole = "owner" | "admin" | "consultant" | "viewer";
export type PartyRole = "client" | "consultant" | "main_contractor" | "subcontractor";

export type Membership = { workspaceId: string; role: WorkspaceRole };
export type PartyGrant = {
  partyId: string;
  projectId: string;
  workspaceId: string;
  role: PartyRole;
  canViewSubs: boolean;
};

export type Principal = {
  userId: string;
  memberships: Membership[];
  parties: PartyGrant[];
};

export type Action =
  | "project.read"
  | "project.write"
  | "stage.read"
  | "stage.write"
  | "submission.create"
  | "dispute.raise"
  | "change.propose"
  | "change.respond"
  | "wallet.reveal"
  | "document.read";

export type Resource =
  | { type: "workspace"; workspaceId: string }
  | { type: "project"; projectId: string; workspaceId: string }
  | {
      type: "stage";
      projectId: string;
      workspaceId: string;
      assignedPartyId: string | null;
    };

export class AuthorizationError extends Error {
  constructor(message = "You cannot do that on this project.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

function membership(principal: Principal, workspaceId: string): WorkspaceRole | undefined {
  return principal.memberships.find((item) => item.workspaceId === workspaceId)?.role;
}

function partiesFor(principal: Principal, projectId: string): PartyGrant[] {
  return principal.parties.filter((item) => item.projectId === projectId);
}

function canReadProject(principal: Principal, projectId: string, workspaceId: string): boolean {
  const role = membership(principal, workspaceId);
  if (role) return true;
  return partiesFor(principal, projectId).length > 0;
}

function canReadStage(principal: Principal, resource: Extract<Resource, { type: "stage" }>): boolean {
  const role = membership(principal, resource.workspaceId);
  if (role === "owner" || role === "admin" || role === "consultant" || role === "viewer") return true;
  for (const party of partiesFor(principal, resource.projectId)) {
    if (party.role === "client" || party.role === "consultant") return true;
    if (party.role === "main_contractor" && party.canViewSubs) return true;
    if (party.role === "subcontractor" && resource.assignedPartyId === party.partyId) return true;
  }
  return false;
}

export function authorize(principal: Principal, action: Action, resource: Resource): boolean {
  if (resource.type === "workspace") {
    const role = membership(principal, resource.workspaceId);
    if (!role) return false;
    if (action === "project.write") return role === "owner" || role === "admin";
    return role === "owner" || role === "admin" || role === "consultant" || role === "viewer";
  }

  const projectId = resource.projectId;
  const workspaceId = resource.workspaceId;
  const parties = partiesFor(principal, projectId);
  const isClient = parties.some((party) => party.role === "client") || membership(principal, workspaceId) === "owner" || membership(principal, workspaceId) === "admin";
  const isContractor = parties.some((party) => party.role === "subcontractor" || party.role === "main_contractor");

  switch (action) {
    case "project.read":
    case "document.read":
      return canReadProject(principal, projectId, workspaceId);
    case "project.write":
    case "stage.write":
    case "change.propose":
      return isClient;
    case "stage.read":
      return resource.type === "stage"
        ? canReadStage(principal, resource)
        : canReadProject(principal, projectId, workspaceId);
    case "submission.create":
      return resource.type === "stage" && canReadStage(principal, resource) && parties.some((party) => party.role === "subcontractor" && resource.assignedPartyId === party.partyId);
    case "dispute.raise":
      return isClient || isContractor;
    case "change.respond":
      return isContractor;
    case "wallet.reveal":
      return resource.type === "project" && parties.length > 0;
    default:
      return false;
  }
}

export function assertCan(principal: Principal, action: Action, resource: Resource): void {
  if (!authorize(principal, action, resource)) throw new AuthorizationError();
}
