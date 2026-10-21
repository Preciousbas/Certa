import { drainJobs } from "../../../../../../src/server/jobs/worker";

export const dynamic = "force-dynamic";

function allowed(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret") ?? "";
  const bearer = request.headers.get("authorization") ?? "";
  return header === secret || bearer === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return Response.json({ error: "unconfigured" }, { status: 503 });
  if (!allowed(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await drainJobs(20);
  return Response.json({ ok: true, ...result });
}
