import { CAP_EXCEEDED_MESSAGE } from "@certa/chain";
import { auditLog, createMemoryDatabase, projects, stages, startOwnProject } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { reconcileProject } from "./reconcile.js";
import { sendTx } from "./tx.js";
import type { ChainPort, Hex } from "./port.js";

const FROM = "0x1111111111111111111111111111111111111111" as Hex;
const TO = "0x2222222222222222222222222222222222222222" as Hex;

function port(revert?: string): { chain: ChainPort; sends: string[] } {
  const sends: string[] = [];
  let n = 0;
  const chain: ChainPort = {
    async simulate() {
      if (revert === "CapExceeded") return { ok: false, name: "CapExceeded", plain: CAP_EXCEEDED_MESSAGE };
      return { ok: true };
    },
    async send(input) {
      sends.push(input.idempotencyKey);
      n += 1;
      return { hash: `0x${n.toString(16).padStart(64, "0")}` as Hex, nonce: 3n };
    },
    async receipt(hash) {
      return {
        status: "success",
        blockNumber: 12n,
        confirmations: 2,
        logs: [{ eventName: "StageReleased", args: { stage: 1n, payout: 1_000_000n }, hash }],
      };
    },
    async ethBalance() {
      return 1_000_000_000_000_000_000n;
    },
    async pendingNonce() {
      return 3;
    },
    async quoteFund() {
      return 1_000_000n;
    },
    async escrowSnapshot() {
      return {
        stages: [{ index: 0, amount: 7_000_000n, status: 1, clientApproved: false }],
        tokenBalance: 7_000_000n,
        totalFunded: 7_000_000n,
        totalOut: 0n,
        clientAccepted: true,
        contractorAccepted: true,
      };
    },
    async allowance() {
      return 0n;
    },
    async erc20Balance() {
      return 0n;
    },
  };
  return { chain, sends };
}

describe("transaction service", () => {
  it("does not broadcast a release above the cap", async () => {
    const { db, close } = await createMemoryDatabase();
    const mocked = port("CapExceeded");
    const row = await sendTx(
      db,
      {
        kind: "release_stage",
        idempotencyKey: "release_stage:stage:approval",
        accountName: "certa-test-operator-00000000",
        from: FROM,
        to: TO,
        data: "0x1234",
        intent: { event: "StageReleased", stageIndex: 2 },
      },
      mocked.chain,
    );
    expect(row.status).toBe("failed");
    expect(row.error).toBe(CAP_EXCEEDED_MESSAGE);
    expect(row.txHash).toBeNull();
    expect(mocked.sends).toEqual([]);
    await close();
  });

  it("sends one transaction when the same release is tapped twice", async () => {
    const { db, close } = await createMemoryDatabase();
    const mocked = port();
    const input = {
      kind: "release_stage" as const,
      idempotencyKey: "release_stage:stage:approval",
      accountName: "certa-test-operator-00000000",
      from: FROM,
      to: TO,
      data: "0x1234" as Hex,
      intent: { event: "StageReleased", stageIndex: 1 },
    };
    const first = await sendTx(db, input, mocked.chain);
    const second = await sendTx(db, input, mocked.chain);
    expect(first.id).toBe(second.id);
    expect(first.txHash).toBe(second.txHash);
    expect(mocked.sends).toEqual(["release_stage:stage:approval"]);
    await close();
  });

  it("retries a failed send that was never broadcast", async () => {
    const { db, close } = await createMemoryDatabase();
    const mocked = port("CapExceeded");
    const input = {
      kind: "create_escrow" as const,
      idempotencyKey: "create_escrow:version",
      accountName: "certa-test-operator-00000000",
      from: FROM,
      to: TO,
      data: "0x1234" as Hex,
      intent: { event: "EscrowCreated" },
    };
    const failed = await sendTx(db, input, mocked.chain);
    expect(failed.status).toBe("failed");
    expect(failed.txHash).toBeNull();
    expect(mocked.sends).toEqual([]);
    mocked.chain.simulate = async () => ({ ok: true });
    const retried = await sendTx(db, input, mocked.chain);
    expect(retried.status).toBe("submitted");
    expect(retried.txHash).toBeTruthy();
    expect(mocked.sends).toEqual(["create_escrow:version"]);
    await close();
  });

  it("raises a reconciliation alert when the database is ahead of the chain", async () => {
    const { db, close } = await createMemoryDatabase();
    const started = await startOwnProject(db, { telegramId: 44001n, name: "Ada", projectName: "Gate", role: "client" });
    await db.insert(stages).values({
      projectId: started.projectId,
      workspaceId: started.workspaceId,
      stageIndex: 0,
      name: "Slab",
      amountNgnKobo: 1n,
      amountUsdc: 7_000_000n,
      retentionBps: 500,
      status: "released",
      funded: true,
      onChainIdx: 0,
    });
    await db
      .update(projects)
      .set({ escrowAddress: "0x3333333333333333333333333333333333333333" })
      .where(eq(projects.id, started.projectId));
    const mocked = port();
    const result = await reconcileProject(db, started.projectId, mocked.chain);
    expect(result.mismatches).toBeGreaterThan(0);
    const alerts = await db.select().from(auditLog).where(eq(auditLog.action, "reconciliation_mismatch"));
    expect(alerts.length).toBe(1);
    const project = (await db.select().from(projects).where(eq(projects.id, started.projectId)))[0];
    expect(project?.chainSync).toBe("updating");
    await close();
  });
});
