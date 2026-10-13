import { getDatabase } from "@certa/db";

export async function GET() {
  const checks: Record<string, string> = { db: "down", storage: "memory", rpc: "unset", cdp: "unset" };
  try {
    await getDatabase();
    checks.db = "ok";
  } catch (error) {
    checks.db = error instanceof Error ? error.message : "down";
  }
  if (process.env.BASE_SEPOLIA_RPC_URL) checks.rpc = "configured";
  if (process.env.CDP_API_KEY_ID) checks.cdp = "configured";
  const ok = checks.db === "ok";
  return Response.json({ ok, checks }, { status: ok ? 200 : 503 });
}
