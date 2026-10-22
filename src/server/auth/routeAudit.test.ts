import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { missingAuth, unauthenticatedRoutes } from "./routeAudit.js";

describe("route auth coverage", () => {
  it("fails when a route does not call an auth helper", () => {
    const source = "export async function POST() { return new Response('open'); }\n";
    expect(missingAuth("app/api/open/route.ts", source)).toBe(true);
  });

  it("allows only health, telegram, cron, paid, and auth", () => {
    expect(missingAuth("apps/web/app/api/health/route.ts", "export function GET() {}")).toBe(false);
    expect(missingAuth("apps/web/app/api/telegram/route.ts", "export function POST() {}")).toBe(false);
    expect(missingAuth("apps/web/app/api/cron/jobs/route.ts", "export function GET() {}")).toBe(false);
    expect(missingAuth("apps/web/app/api/paid/weather/route.ts", "export function GET() {}")).toBe(false);
    expect(missingAuth("apps/web/app/api/auth/logout/route.ts", "export function POST() {}")).toBe(false);
    expect(missingAuth("apps/web/app/api/mini/fund/route.ts", "export const POST = function run() {}")).toBe(true);
  });

  it("finds no unprotected route under app/api", () => {
    const root = resolve("apps/web/app/api");
    expect(unauthenticatedRoutes(root)).toEqual([]);
  });
});
