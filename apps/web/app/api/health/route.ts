import { probeBaseSepolia, sepoliaRpcUrl } from "@certa/chain";
import { getDatabase } from "@certa/db";
import { factoryAddress } from "../../../lib/published-chain";
import { queueCounts } from "../../../../../src/server/jobs/worker";
import { storageHealth } from "../../../../../src/server/storage";
import { apiError, emptyQuery, queryOf } from "../../../lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = emptyQuery.safeParse(queryOf(request));
  if (!query.success) return apiError(400, "That request is not valid.");
  const checks: Record<string, string> = {
    db: "down",
    storage: await storageHealth(),
    rpc: "unset",
    usdc: "unset",
    cdp: "unconfigured",
    contract: "unset",
  };
  try {
    await getDatabase();
    checks.db = "ok";
  } catch {
    checks.db = "error";
  }
  const cdpReady = Boolean(
    process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET && process.env.CDP_WALLET_SECRET,
  );
  if (cdpReady) checks.cdp = "configured";
  try {
    const probe = await probeBaseSepolia(sepoliaRpcUrl());
    checks.rpc = probe.rpc;
    checks.usdc = probe.usdc;
  } catch {
    checks.rpc = "down";
    checks.usdc = "down";
  }
  const factory = factoryAddress();
  checks.contract = factory;
  const factoryOk = /^0x[a-fA-F0-9]{40}$/.test(factory);
  let queue = { queued: 0, dead: 0 };
  try {
    queue = await queueCounts();
  } catch {
    queue = { queued: 0, dead: 0 };
  }
  const aiDoc = process.env.AI_DOC_MODEL || process.env.LLM_TEXT_MODEL ? "ok" : "unconfigured";
  const aiVision =
    process.env.AI_VISION_MODEL || process.env.LLM_VISION_MODEL ? "ok" : "unconfigured";
  const x402 =
    process.env.X402_PAY_TO_ADDRESS || process.env.CLIENT_ADDRESS ? "ok" : "unconfigured";
  const requiredOk =
    checks.db === "ok" &&
    checks.rpc === "ok" &&
    checks.usdc === "ok" &&
    factoryOk &&
    checks.storage === "ok";
  const body = {
    ok: requiredOk,
    status: requiredOk ? "ok" : "degraded",
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    checks,
    db: checks.db === "ok" ? "ok" : "error",
    storage: checks.storage,
    rpc: checks.rpc === "ok" ? "ok" : "error",
    chainId: 11155111,
    usdc: checks.usdc === "ok" ? "ok" : "error",
    factory: factoryOk ? "ok" : "unconfigured",
    cdp: cdpReady ? "ok" : "unconfigured",
    ai_doc: aiDoc,
    ai_vision: aiVision,
    x402,
    queue,
    time: new Date().toISOString(),
  };
  return Response.json(body, { status: requiredOk ? 200 : 503 });
}
