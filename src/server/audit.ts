import { appendAudit, type Database } from "@certa/db";

export async function audit(
  db: Database,
  input: {
    action: string;
    entity: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
    actor?: string;
    reason?: string;
    requestId?: string;
    workspaceId?: string;
    projectId?: string;
    actorKind?: string;
  },
) {
  const payload = JSON.stringify({
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason ?? null,
    requestId: input.requestId ?? null,
  });
  return appendAudit(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actorUserId: input.actor,
    actorKind: input.actorKind,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    payload,
  });
}
