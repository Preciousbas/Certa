import { getDatabase, projects, type Database } from "@certa/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { attachCookies, authenticate } from "../../../src/server/auth/authenticate";
import { assertCsrf } from "../../../src/server/auth/csrf";
import { failureResponse } from "../../../src/server/auth/errors";
import { assertCanSubmitStage, requireMember, requirePlatformAdmin, runAsUser, type Role } from "../../../src/server/auth/rbac";
import { limitAi, limitMini, limitUpload, rateLimitedResponse } from "../../../src/server/auth/rateLimit";
import { apiError, projectIdField } from "./schemas";

export type AppRole = Role | "admin";

export type Authed = {
  db: Database;
  userId: string;
  telegramId: bigint;
  project: typeof projects.$inferSelect;
  roles: AppRole[];
  json: unknown;
  form?: FormData;
  request: Request;
};

async function readBody(request: Request): Promise<{ json: unknown; form?: FormData; projectId: string } | Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    const projectId = String(form.get("projectId") ?? "");
    if (!projectIdField.safeParse(projectId).success) return apiError(400, "This project is missing.");
    return { json: null, form, projectId };
  }
  const json: unknown = await request.json().catch(() => null);
  const parsed = z.object({ projectId: projectIdField }).safeParse(json);
  if (!parsed.success) return apiError(400, "This project is missing.");
  return { json, projectId: parsed.data.projectId };
}

export function withAuth(
  handler: (ctx: Authed) => Promise<Response>,
  options: { roles?: AppRole[]; assignedStage?: boolean; platformAdmin?: boolean; upload?: boolean; ai?: boolean },
) {
  return async function authed(request: Request): Promise<Response> {
    const db = await getDatabase();
    try {
      const auth = await authenticate(request, db);
      if (auth.via === "session") assertCsrf(request, auth.csrf);
      if (!(await limitMini(auth.user.id))) return rateLimitedResponse();
      if (options.upload && !(await limitUpload(auth.user.id))) return rateLimitedResponse();
      const body = await readBody(request);
      if (body instanceof Response) return attachCookies(body, auth.setCookies);
      const project = (await db.select().from(projects).where(eq(projects.id, body.projectId)))[0];
      if (!project) return attachCookies(apiError(404, "That project is not available."), auth.setCookies);
      if (options.ai && !(await limitAi(project.id))) return attachCookies(rateLimitedResponse(), auth.setCookies);
      const result = await runAsUser({ db, userId: auth.user.id }, async () => {
        if (options.platformAdmin) {
          const { membership } = await requireMember(project.id);
          await requirePlatformAdmin();
          const response = await handler({
            db,
            userId: auth.user.id,
            telegramId: auth.user.telegramId,
            project,
            roles: [membership.role as AppRole],
            json: body.json,
            form: body.form,
            request,
          });
          return response;
        }
        const roles = (options.roles ?? []).filter((role): role is Role => role !== "admin");
        const { membership } = await requireMember(project.id, roles.length ? roles : undefined);
        if (options.assignedStage) {
          const stageId = body.form ? String(body.form.get("stageId") ?? "") : stageIdOf(body.json);
          if (projectIdField.safeParse(stageId).success) await assertCanSubmitStage(project.id, stageId);
        }
        const response = await handler({
          db,
          userId: auth.user.id,
          telegramId: auth.user.telegramId,
          project,
          roles: [membership.role as AppRole],
          json: body.json,
          form: body.form,
          request,
        });
        return response;
      });
      return attachCookies(result, auth.setCookies);
    } catch (error) {
      return failureResponse(error);
    }
  };
}

function stageIdOf(json: unknown): string {
  if (!json || typeof json !== "object" || !("stageId" in json)) return "";
  const value = json.stageId;
  return typeof value === "string" ? value : "";
}

export async function requireUser(request: Request) {
  const db = await getDatabase();
  const auth = await authenticate(request, db);
  if (auth.via === "session") assertCsrf(request, auth.csrf);
  if (!(await limitMini(auth.user.id))) return rateLimitedResponse();
  return auth;
}

export function withUser(handler: (userId: string, request: Request) => Promise<Response>) {
  return async function authed(request: Request): Promise<Response> {
    try {
      const auth = await requireUser(request);
      if (auth instanceof Response) return auth;
      if (!(await limitUpload(auth.user.id))) return rateLimitedResponse();
      const response = await handler(auth.user.id, request);
      return attachCookies(response, auth.setCookies);
    } catch (error) {
      return failureResponse(error);
    }
  };
}
