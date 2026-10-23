import { cdpConfigured, probeBaseSepolia, sepoliaRpcUrl } from "@certa/chain";
import { getDatabase, jobs } from "@certa/db";
import { desc, isNotNull, sql } from "drizzle-orm";
import { createPublicClient, http, type Hex } from "viem";
import { baseSepolia, sepolia } from "viem/chains";
import { payToRefusal } from "../x402/gate";

const BASE_SEPOLIA_CHAIN = 84532;
const FACTORY: Hex = "0x4F4c6cc95465ceFe8a967E351EEdE69d40660423";

export type Diagnostics = {
  database: "ok" | "down";
  ethereumSepolia: "ok" | "down";
  baseSepolia: "ok" | "down";
  escrowFactory: "reachable" | "unreachable";
  cdp: "configured" | "unconfigured";
  x402PayTo: "passes" | "fails";
  lastWorkerRun: string;
  version: string;
  recentErrors: string[];
};

function baseRpcUrl(): string {
  return process.env.X402_RPC_URL || "https://sepolia.base.org";
}

async function within<T>(work: Promise<T>, fallback: T, ms = 8_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function redact(value: string): string {
  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]").slice(0, 180);
}

/** Read-only probes. Values of secrets are never included. */
export async function loadDiagnostics(): Promise<Diagnostics> {
  const version = process.env.VERCEL_GIT_COMMIT_SHA || "local";
  const cdp = cdpConfigured() ? "configured" : "unconfigured";
  const x402PayTo = payToRefusal() ? "fails" : "passes";
  const db = await getDatabase();
  let database: Diagnostics["database"] = "down";
  let lastWorkerRun = "Not recorded";
  let recentErrors: string[] = [];
  try {
    await db.execute(sql`select 1`);
    database = "ok";
    const [latest] = await db.select({ status: jobs.status, kind: jobs.kind }).from(jobs).orderBy(desc(jobs.updatedAt)).limit(1);
    if (latest) lastWorkerRun = `${latest.kind} ${latest.status}`;
    const failed = await db
      .select({ kind: jobs.kind, lastError: jobs.lastError })
      .from(jobs)
      .where(isNotNull(jobs.lastError))
      .orderBy(desc(jobs.updatedAt))
      .limit(5);
    recentErrors = failed.flatMap((row) => (row.lastError ? [`${row.kind}: ${redact(row.lastError)}`] : []));
  } catch {
    database = "down";
  }
  const ethereum = await within(
    probeBaseSepolia(sepoliaRpcUrl()).then((probe) => (probe.rpc === "ok" ? "ok" : "down")),
    "down" as const,
  );
  const base = await within(
    (async () => {
      const client = createPublicClient({ chain: baseSepolia, transport: http(baseRpcUrl(), { timeout: 8_000 }) });
      const chainId = await client.getChainId();
      return chainId === BASE_SEPOLIA_CHAIN ? "ok" : "down";
    })(),
    "down" as const,
  );
  const escrowFactory = await within(
    (async () => {
      const client = createPublicClient({
        chain: sepolia,
        transport: http(sepoliaRpcUrl(), { timeout: 8_000 }),
      });
      const code = await client.getCode({ address: FACTORY });
      return code && code !== "0x" ? "reachable" : "unreachable";
    })(),
    "unreachable" as const,
  );
  return {
    database,
    ethereumSepolia: ethereum,
    baseSepolia: base,
    escrowFactory,
    cdp,
    x402PayTo,
    lastWorkerRun,
    version,
    recentErrors,
  };
}
