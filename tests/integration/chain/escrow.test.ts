import { accountName, CAP_EXCEEDED_MESSAGE } from "@certa/chain";
import { auditLog, createMemoryDatabase, projects, stages, startOwnProject } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { reconcileProject } from "../../../src/server/chain/reconcile.js";
import { sendTx } from "../../../src/server/chain/tx.js";
import type { ChainPort, Hex } from "../../../src/server/chain/port.js";
import { assertRolesDistinct, RolesNotDistinct } from "../../../src/server/chain/wallets.js";

const FROM = "0x1111111111111111111111111111111111111111" as Hex;
const TO = "0x2222222222222222222222222222222222222222" as Hex;

function port(): { chain: ChainPort; sends: string[] } {
  const sends: string[] = [];
  const chain: ChainPort = {
    async simulate() {
      return { ok: false, name: "CapExceeded", plain: CAP_EXCEEDED_MESSAGE };
    },
    async send(input) {
      sends.push(input.idempotencyKey);
      return { hash: `0x${"ab".repeat(32)}` as Hex, nonce: 1n };
    },
    async receipt() {
      return null;
    },
    async ethBalance() {
      return 0n;
    },
    async pendingNonce() {
      return 0;
    },
    async quoteFund() {
      return 0n;
    },
    async escrowSnapshot() {
      return {
        stages: [{ index: 0, amount: 6_000_000n, status: 1, clientApproved: false }],
        tokenBalance: 6_000_000n,
        totalFunded: 6_000_000n,
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

describe("chain integration", () => {
  it("keeps four role addresses distinct and fits the CDP name limit", () => {
    expect(accountName("subcontractor", "user-1").length).toBeLessThanOrEqual(36);
    expect(() =>
      assertRolesDistinct({
        client: FROM,
        consultant: FROM,
        operator: "0x3333333333333333333333333333333333333333",
        contractor: "0x4444444444444444444444444444444444444444",
      }),
    ).toThrow(RolesNotDistinct);
  });

  it("catches a cap breach before broadcast and alerts on a desynced stage", async () => {
    const { db, close } = await createMemoryDatabase();
    const mocked = port();
    const blocked = await sendTx(
      db,
      {
        kind: "release_stage",
        idempotencyKey: "release_stage:one:two",
        accountName: "certa-test-operator-aaaaaaaa",
        from: FROM,
        to: TO,
        data: "0x",
        intent: { event: "StageReleased", stageIndex: 1 },
      },
      mocked.chain,
    );
    expect(blocked.error).toBe("This payment is above the spending cap, so the client must tap Approve first.");
    expect(mocked.sends).toHaveLength(0);
    const again = await sendTx(
      db,
      {
        kind: "release_stage",
        idempotencyKey: "release_stage:one:two",
        accountName: "certa-test-operator-aaaaaaaa",
        from: FROM,
        to: TO,
        data: "0x",
        intent: { event: "StageReleased", stageIndex: 1 },
      },
      mocked.chain,
    );
    expect(again.id).toBe(blocked.id);
    expect(mocked.sends).toHaveLength(0);

    const started = await startOwnProject(db, { telegramId: 45002n, name: "Ada", projectName: "Beam", role: "client" });
    await db.insert(stages).values({
      projectId: started.projectId,
      workspaceId: started.workspaceId,
      stageIndex: 1,
      name: "Deck",
      amountNgnKobo: 2n,
      amountUsdc: 6_000_000n,
      retentionBps: 500,
      status: "released",
      funded: true,
      onChainIdx: 0,
    });
    await db
      .update(projects)
      .set({ escrowAddress: "0x5555555555555555555555555555555555555555" })
      .where(eq(projects.id, started.projectId));
    const result = await reconcileProject(db, started.projectId, mocked.chain);
    expect(result.mismatches).toBe(1);
    expect((await db.select().from(auditLog).where(eq(auditLog.action, "reconciliation_mismatch"))).length).toBe(1);
    await close();
  });
});
