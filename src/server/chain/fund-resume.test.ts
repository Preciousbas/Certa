import { createMemoryDatabase, stages, startOwnProject } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { applyConfirmation } from "./apply.js";

describe("a faucet transfer is not a lock", () => {
  it("leaves stages unfunded when test USDC confirms", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, { telegramId: 81n, name: "Ada", projectName: "Plot", role: "client" });
    const [stage] = await opened.db.insert(stages).values({
      projectId: created.projectId,
      workspaceId: created.workspaceId,
      stageIndex: 0,
      onChainIdx: 0,
      name: "One",
      amountNgnKobo: 100n,
      amountUsdc: 100n,
      retentionBps: 0,
      funded: false,
    }).returning();
    await applyConfirmation(opened.db, {
      id: "tx",
      kind: "test_usdc",
      projectId: created.projectId,
      stageId: null,
      txHash: "0x" + "ab".repeat(32),
      status: "confirmed",
      idempotencyKey: "test_usdc:plot",
      fromAddress: "0x1111111111111111111111111111111111111111",
      toAddress: "0x2222222222222222222222222222222222222222",
      intentJson: { event: "Transfer" },
    } as never, { event: "Transfer" }, []);
    const row = (await opened.db.select().from(stages).where(eq(stages.id, stage!.id)))[0];
    expect(row?.funded).toBe(false);
    await opened.close();
  });
});
