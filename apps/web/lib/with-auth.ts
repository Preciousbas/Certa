import { getDatabase, loadPrincipal, projects, users, type PartyRole, type Principal } from "@certa/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { consumeRateLimit } from "./rate-limit";
import { apiError, projectIdField } from "./schemas";
import { userFromRequest } from "./telegram-auth";

export type AppRole = "client" | "consultant" | "contractor" | "subcontractor" | "admin";

export type Authed = {
  db: Awaited<ReturnType<typeof getDatabase>>;
  userId: string;
  telegramId: bigint;
  project: typeof projects.$inferSelect;
  roles: AppRole[];
  json: unknown;
  form?: FormData;
  request: Request;
};

const partyRole: Record<PartyRole, AppRole | null> = {
  client: "client",
  consultant: "consultant",
  main_contractor: "contractor",
  subcontractor: "subcontractor",
};

export function rolesOnProject(principal: Principal, projectId: string, workspaceId: string): AppRole[] {
  const roles = new Set<AppRole>();
  for (const party of principal.parties) {
    if (party.projectId !== projectId) continue;
    const role = partyRole[party.role];
    if (role) roles.add(role);
  }
  const member = principal.memberships.find((item) => item.workspaceId === workspaceId);
  if (member?.role === "admin") roles.add("admin");
  return [...roles];
}

export function withAuth(handler: (ctx: Authed) => Promise<Response>, options: { roles: AppRole[] }) {
  return async function authed(request: Request): Promise<Response> {
    const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
    const telegramUser = userFromRequest(request, token);
    if (!telegramUser) return apiError(401, "Sign in from Telegram.");
    if (!consumeRateLimit(`tg:${telegramUser.id}`).ok) return apiError(429, "Too many requests. Wait a minute.");

    const db = await getDatabase();
    const user = (await db.select().from(users).where(eq(users.telegramId, BigInt(telegramUser.id))))[0];
    if (!user) return apiError(401, "Sign in from Telegram.");
    const principal = await loadPrincipal(db, user.id);

    const contentType = request.headers.get("content-type") ?? "";
    let projectId = "";
    let json: unknown = null;
    let form: FormData | undefined;
    if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      form = await request.formData();
      projectId = String(form.get("projectId") ?? "");
    } else {
      json = await request.json().catch(() => null);
      const parsed = z.object({ projectId: projectIdField }).safeParse(json);
      if (!parsed.success) return apiError(400, "This project is missing.");
      projectId = parsed.data.projectId;
    }
    if (!projectIdField.safeParse(projectId).success) return apiError(400, "This project is missing.");

    const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
    if (!project) return apiError(404, "That project is not available.");
    const roles = rolesOnProject(principal, project.id, project.workspaceId);
    if (!options.roles.some((role) => roles.includes(role))) return apiError(403, "You cannot do that on this project.");

    try {
      return await handler({ db, userId: user.id, telegramId: user.telegramId, project, roles, json, form, request });
    } catch (error) {
      console.error(error);
      return apiError(500, "Something went wrong. Try again.");
    }
  };
}
