import { chainTxs, projects, workspaces, x402Spend, type Database } from "@certa/db";
import { and, eq, gte, inArray } from "drizzle-orm";
import { explorerTx } from "../chain/networks.js";
import { formatWat } from "../verify/messages.js";
import { BASE_SEPOLIA_CHAIN, lagosMonthStart, usdcPlain } from "./gate.js";
import { allowanceState } from "./ledger.js";

export type SpendRow = {
  at: Date;
  project: string;
  purpose: string;
  amountMicro: bigint;
  result: string;
  proof: string | null;
};

export async function monthSpend(
  db: Database,
  workspaceId: string,
): Promise<{ allowanceMicro: bigint; spentMicro: bigint; rows: SpendRow[] }> {
  const workspace = (await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)))[0];
  const allowanceMicro = workspace ? (workspace.allowanceMicro > 0n ? workspace.allowanceMicro : workspace.x402AllowanceUsdc) : 0n;
  const start = lagosMonthStart();
  const owned = await db.select().from(projects).where(eq(projects.workspaceId, workspaceId));
  const ids = owned.map((row) => row.id);
  const names = new Map(owned.map((row) => [row.id, row.name]));
  if (ids.length === 0) return { allowanceMicro, spentMicro: 0n, rows: [] };
  const spends = await db
    .select()
    .from(x402Spend)
    .where(and(inArray(x402Spend.projectId, ids), gte(x402Spend.createdAt, start)));
  const txs = await db.select().from(chainTxs).where(inArray(chainTxs.projectId, ids));
  const txById = new Map(txs.map((row) => [row.id, row]));
  const rows: SpendRow[] = spends.map((row) => {
    const tx = row.chainTxId ? txById.get(row.chainTxId) : undefined;
    const hash = tx?.txHash;
    return {
      at: row.createdAt,
      project: names.get(row.projectId) ?? "Project",
      purpose: row.endpoint.includes("weather") ? "Weather check" : row.endpoint,
      amountMicro: row.amountMicro,
      result: row.resultSummary,
      proof: hash && tx?.chainId === BASE_SEPOLIA_CHAIN ? explorerTx(BASE_SEPOLIA_CHAIN, hash) : null,
    };
  });
  const topups = txs.filter((row) => row.kind === "gas_topup" && row.createdAt >= start);
  for (const row of topups) {
    rows.push({
      at: row.createdAt,
      project: row.projectId ? (names.get(row.projectId) ?? "Project") : "Project",
      purpose: "Network fee",
      amountMicro: 0n,
      result: "Network fee",
      proof: row.txHash ? explorerTx(row.chainId, row.txHash) : null,
    });
  }
  rows.sort((a, b) => b.at.getTime() - a.at.getTime());
  const spentMicro = spends.reduce((sum, row) => sum + row.amountMicro, 0n);
  return { allowanceMicro, spentMicro, rows };
}

export function spendHeading(spentMicro: bigint, allowanceMicro: bigint): string {
  return `Agent spending this month: ${usdcPlain(spentMicro)} USDC of ${usdcPlain(allowanceMicro)} USDC allowance`;
}

export type SpendDisplay = {
  heading: string;
  rows: {
    key: string;
    at: string;
    project: string;
    purpose: string;
    amount: string;
    result: string;
    proof: string | null;
  }[];
};

export function presentSpend(input: { allowanceMicro: bigint; spentMicro: bigint; rows: SpendRow[] }): SpendDisplay {
  return {
    heading: spendHeading(input.spentMicro, input.allowanceMicro),
    rows: input.rows.map((row) => ({
      key: `${row.at.toISOString()}-${row.purpose}-${row.project}`,
      at: formatWat(row.at),
      project: row.project,
      purpose: row.purpose,
      amount: `${usdcPlain(row.amountMicro)} USDC`,
      result: row.result,
      proof: row.proof,
    })),
  };
}

export async function projectSpend(db: Database, projectId: string) {
  const state = await allowanceState(db, projectId);
  if (!state) return { allowanceMicro: 0n, spentMicro: 0n, rows: [] as SpendRow[] };
  return monthSpend(db, state.workspaceId);
}
