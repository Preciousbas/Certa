import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const AUTH_HELPERS = [
  "requireMember(",
  "requirePlatformAdmin(",
  "requireUser(",
  "withAuth(",
  "withUser(",
  "withProject(",
  "requireSignedDownload(",
  "requireCronSecret(",
  "requireWebhookSecret(",
  "requirePaidAccess(",
];

export function routeIsAllowlisted(file: string): boolean {
  const path = file.replaceAll("\\", "/");
  if (path.endsWith("/api/health/route.ts") || path.endsWith("/api/telegram/route.ts")) return true;
  if (path.includes("/api/cron/")) return true;
  if (path.includes("/api/paid/")) return true;
  if (path.includes("/api/auth/")) return true;
  if (path.endsWith("/api/test/journey/route.ts")) return true;
  return false;
}

export function missingAuth(file: string, source: string): boolean {
  if (routeIsAllowlisted(file)) return false;
  return !AUTH_HELPERS.some((helper) => source.includes(helper));
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (name === "route.ts") found.push(path);
  }
  return found;
}

export function unauthenticatedRoutes(root: string): string[] {
  return walk(root)
    .filter((file) => missingAuth(file, readFileSync(file, "utf8")))
    .sort();
}
