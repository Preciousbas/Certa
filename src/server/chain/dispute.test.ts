import {
  chainTxs,
  createMemoryDatabase,
  memberships,
  projects,
  stages,
  startOwnProject,
  users,
  wallets,
} from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ChainRejected, disputeTx } from "./flows.js";
import { SEPOLIA_CHAIN_ID } from "./networks.js";
import type { ChainPort, Hex } from "./port.js";

const ESCROW = "0x5555555555555555555555555555555555555555" as Hex;

function touchingPort(): ChainPort & { calls: string[] } {
  const calls: string[] = [];
  const chain: ChainPort & { calls: string[] } = {
    calls,
    async simulate() {
      calls.push("simulate");
      return { ok: false, name: "Held", plain: "held" };
    },
    async send() {
      calls.push("send");
      return { hash: `0x${"ab".repeat(32)}` as Hex, nonce: 1n };
    },
    async receipt() {
      calls.push("receipt");
      return null;
    },
    async ethBalance() {
      calls.push("ethBalance");
      return 0n;
    },
    async pendingNonce() {
      calls.push("pendingNonce");
      return 0;
    },
    async quoteFund() {
      calls.push("quoteFund");
      return 0n;
    },
    async escrowSnapshot() {
      calls.push("escrowSnapshot");
      return {
        stages: [],
        tokenBalance: 0n,
        totalFunded: 0n,
        totalOut: 0n,
        clientAccepted: true,
        contractorAccepted: true,
      };
    },
    async allowance() {
      calls.push("allowance");
      return 0n;
    },
    async erc20Balance() {
      calls.push("erc20Balance");
      return 0n;
    },
  };
  return chain;
}

describe("placeholder consultant disputes", () => {
  it("keeps a client-mode dispute off chain and leaves the stage submitted", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, {
      telegramId: 8101n,
      name: "Ada",
      projectName: "Plot",
      role: "client",
    });
    await opened.db
      .update(projects)
      .set({ approvalMode: "client", escrowAddress: ESCROW })
      .where(eq(projects.id, created.projectId));
    const [stage] = await opened.db
      .insert(stages)
      .values({
        projectId: created.projectId,
        workspaceId: created.workspaceId,
        stageIndex: 0,
        onChainIdx: 0,
        name: "One",
        amountNgnKobo: 100n,
        amountUsdc: 1_000_000n,
        retentionBps: 0,
        status: "submitted",
      })
      .returning();
    const port = touchingPort();
    await expect(
      disputeTx(
        opened.db,
        {
          projectId: created.projectId,
          stageId: stage!.id,
          stageIndex: 0,
          reason: "The finish does not match the drawing.",
          from: "client",
        },
        port,
      ),
    ).rejects.toThrow(
      new ChainRejected(
        "This dispute stays in Certa. The money stays locked until you both agree.",
      ),
    );
    expect(port.calls).toEqual([]);
    expect(await opened.db.select().from(chainTxs)).toHaveLength(0);
    expect(await opened.db.select().from(wallets)).toHaveLength(0);
    expect((await opened.db.select().from(stages).where(eq(stages.id, stage!.id)))[0]?.status).toBe(
      "submitted",
    );
    await opened.close();
  });

  it("refuses when a consultant joined after lock and the placeholder wallet remains", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, {
      telegramId: 8102n,
      name: "Ada",
      projectName: "Plot",
      role: "client",
    });
    const consultant = (
      await opened.db.insert(users).values({ telegramId: 8103n, name: "Okafor" }).returning()
    )[0]!;
    await opened.db
      .insert(memberships)
      .values({ projectId: created.projectId, userId: consultant.id, role: "consultant" });
    await opened.db
      .update(projects)
      .set({ approvalMode: "consultant", consultantFromStage: 1, escrowAddress: ESCROW })
      .where(eq(projects.id, created.projectId));
    await opened.db.insert(wallets).values({
      projectId: created.projectId,
      purpose: "consultant",
      provider: "mock",
      providerAccountRef: "certa-placeholder-consultant",
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      chainId: SEPOLIA_CHAIN_ID,
    });
    const [stage] = await opened.db
      .insert(stages)
      .values({
        projectId: created.projectId,
        workspaceId: created.workspaceId,
        stageIndex: 1,
        onChainIdx: 1,
        name: "Two",
        amountNgnKobo: 100n,
        amountUsdc: 1_000_000n,
        retentionBps: 0,
        status: "submitted",
      })
      .returning();
    const port = touchingPort();
    await expect(
      disputeTx(
        opened.db,
        {
          projectId: created.projectId,
          stageId: stage!.id,
          stageIndex: 1,
          reason: "The finish does not match the drawing.",
          from: "contractor",
        },
        port,
      ),
    ).rejects.toBeInstanceOf(ChainRejected);
    expect(port.calls).toEqual([]);
    expect((await opened.db.select().from(stages).where(eq(stages.id, stage!.id)))[0]?.status).toBe(
      "submitted",
    );
    await opened.close();
  });

  it("still reaches the chain when the consultant wallet belongs to a person", async () => {
    const opened = await createMemoryDatabase();
    const created = await startOwnProject(opened.db, {
      telegramId: 8104n,
      name: "Ada",
      projectName: "Plot",
      role: "client",
    });
    const contractor = (
      await opened.db.insert(users).values({ telegramId: 8105n, name: "Kemfor" }).returning()
    )[0]!;
    const consultant = (
      await opened.db.insert(users).values({ telegramId: 8106n, name: "Okafor" }).returning()
    )[0]!;
    await opened.db.insert(memberships).values([
      { projectId: created.projectId, userId: contractor.id, role: "contractor" },
      { projectId: created.projectId, userId: consultant.id, role: "consultant" },
    ]);
    await opened.db
      .update(projects)
      .set({ approvalMode: "consultant", escrowAddress: ESCROW })
      .where(eq(projects.id, created.projectId));
    const [stage] = await opened.db
      .insert(stages)
      .values({
        projectId: created.projectId,
        workspaceId: created.workspaceId,
        stageIndex: 0,
        onChainIdx: 0,
        name: "One",
        amountNgnKobo: 100n,
        amountUsdc: 1_000_000n,
        retentionBps: 0,
        status: "submitted",
      })
      .returning();
    const port = touchingPort();
    await expect(
      disputeTx(
        opened.db,
        {
          projectId: created.projectId,
          stageId: stage!.id,
          stageIndex: 0,
          reason: "The finish does not match the drawing.",
          from: "client",
        },
        port,
      ),
    ).rejects.toThrow(new ChainRejected("held"));
    expect(port.calls).toEqual(["simulate"]);
    await opened.close();
  });
});
