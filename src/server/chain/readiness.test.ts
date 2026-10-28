import { chainTxs, contractVersions, createMemoryDatabase, memberships, stages, startOwnProject, users } from "@certa/db";
import { describe, expect, it } from "vitest";
import { expectedFundMicro } from "../../lib/fund-range.js";
import { lockReadiness } from "./readiness.js";
import type { ChainPort, Hex } from "./port.js";

function quietPort(usdc = 0n): ChainPort & { sends: number } {
  const chain = {
    sends: 0,
    async simulate() { return { ok: true as const }; },
    async send() { chain.sends += 1; return { hash: `0x${"11".repeat(32)}` as Hex, nonce: 1n }; },
    async receipt() { return { status: "success" as const, blockNumber: 1n, confirmations: 2, logs: [] }; },
    async ethBalance() { return 10n ** 18n; },
    async pendingNonce() { return 1; },
    async quoteFund() { return 1_000_000n; },
    async erc20Balance() { return usdc; },
    async allowance() { return 0n; },
    async escrowSnapshot() { return { clientAccepted: true, contractorAccepted: true, stages: [], tokenBalance: 0n, totalFunded: 0n, totalOut: 0n }; },
  };
  return chain;
}

describe("lock readiness", () => {
  it("matches the contract quote with and without mobilisation", () => {
    const rows = [
      { kind: "mobilisation", funded: false, amountUsdc: 25n, onChainIdx: -1 },
      { kind: "work", funded: false, amountUsdc: 100n, onChainIdx: 0 },
      { kind: "work", funded: true, amountUsdc: 80n, onChainIdx: 1 },
    ];
    expect(expectedFundMicro(rows, 1)).toBe(125n);
    expect(expectedFundMicro(rows.map((row) => row.kind === "mobilisation" ? { ...row, funded: true } : row), 1)).toBe(100n);
  });

  it("reports a missing consultant without throwing or sending", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 51n, name: "Ada", projectName: "Plot", role: "client" });
    const port = quietPort();
    const check = await lockReadiness(opened.db, { projectId: created.projectId, upToStage: 0 }, port);
    expect(check.code === "people_missing" || check.code === "plan_not_agreed").toBe(true);
    expect(port.sends).toBe(0);
    await opened.close();
  });

  it("asks for test USDC before anything is sent", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 61n, name: "Ada", projectName: "Plot", role: "client" });
    const contractor = (await opened.db.insert(users).values({ telegramId: 62n, name: "Kemfor" }).returning())[0]!;
    const consultant = (await opened.db.insert(users).values({ telegramId: 63n, name: "Okafor" }).returning())[0]!;
    await opened.db.insert(memberships).values([
      { projectId: created.projectId, userId: contractor.id, role: "contractor" },
      { projectId: created.projectId, userId: consultant.id, role: "consultant" },
    ]);
    await opened.db.insert(contractVersions).values({
      projectId: created.projectId,
      version: 1,
      status: "accepted",
      contractSumKobo: 100n,
      koboPerUsdc: 1n,
      fxSource: "test",
      fxAsOf: "2026-10-01",
      spendingCapMicro: 1_000_000n,
      terms: {},
      documentHashes: [],
      contentHash: "abc",
      createdBy: created.userId,
    });
    await opened.db.insert(stages).values({
      projectId: created.projectId, workspaceId: created.workspaceId, stageIndex: 0, onChainIdx: 0, name: "One", amountNgnKobo: 100n, amountUsdc: 1_000_000n, retentionBps: 0,
    });
    const port = quietPort(0n);
    const check = await lockReadiness(opened.db, { projectId: created.projectId, upToStage: 0 }, port);
    expect(check.code).toBe("needs_usdc");
    expect(check.clientAddress).toMatch(/^0x/);
    expect(check.faucetUrl).toBe("https://faucet.circle.com/");
    expect(port.sends).toBe(0);
    await opened.db.insert(chainTxs).values({
      kind: "fund",
      idempotencyKey: "fund:test",
      status: "submitted",
      projectId: created.projectId,
      chainId: 11155111,
      fromAddress: "0x1111111111111111111111111111111111111111",
      toAddress: "0x2222222222222222222222222222222222222222",
      calldata: "0x",
    });
    const busy = await lockReadiness(opened.db, { projectId: created.projectId, upToStage: 0 }, port);
    expect(busy.code).toBe("lock_in_progress");
    await opened.close();
  });
});
