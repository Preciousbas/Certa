import { chainTxs, contractVersions, memberships, projects, stages, type Database } from "@certa/db";
import { and, eq } from "drizzle-orm";
import { formatUsdc } from "../../lib/money/usdc.js";
import { expectedFundMicro } from "../../lib/fund-range.js";
import { nextStep } from "../../bot/flows/next.js";
import { SEPOLIA_CHAIN_ID } from "./networks.js";
import { defaultPort, type ChainPort, type Hex } from "./port.js";
import { GAS_FLOOR, GAS_TOPUP } from "./gas.js";
import { ConsultantRequired, getOrCreateWallet } from "./wallets.js";
import { projectRoleWallets } from "./flows.js";

export type LockCode =
  | "ready"
  | "paused"
  | "wrong_network"
  | "plan_not_agreed"
  | "people_missing"
  | "nothing_to_fund"
  | "lock_in_progress"
  | "needs_usdc"
  | "gas_low";

export type LockCheck = {
  ready: boolean;
  code: LockCode;
  message: string;
  next: string | null;
  neededMicro: bigint;
  heldMicro: bigint;
  clientAddress: `0x${string}` | null;
  faucetUrl: string | null;
  resumeFrom: "escrow" | "accept" | "approve" | "fund" | null;
};

function usdcAmount(micro: bigint): string {
  return formatUsdc(micro, { dp: 2 }).replace(/ USDC$/, "");
}

function stop(partial: Partial<LockCheck> & Pick<LockCheck, "code" | "message">): LockCheck {
  return {
    ready: false,
    next: null,
    neededMicro: 0n,
    heldMicro: 0n,
    clientAddress: null,
    faucetUrl: null,
    resumeFrom: null,
    ...partial,
  };
}

export async function lockReadiness(
  db: Database,
  input: { projectId: string; upToStage: number },
  port: ChainPort = defaultPort(),
): Promise<LockCheck> {
  const project = (await db.select().from(projects).where(eq(projects.id, input.projectId)))[0];
  if (!project) return stop({ code: "paused", message: "This project is paused." });
  if (project.status === "paused") return stop({ code: "paused", message: "This project is paused." });
  if (process.env.CHAIN_ID && process.env.CHAIN_ID !== String(SEPOLIA_CHAIN_ID)) {
    return stop({ code: "wrong_network", message: "Certa only locks money on Ethereum Sepolia." });
  }
  const version = (await db.select().from(contractVersions).where(eq(contractVersions.projectId, input.projectId))).find((row) => row.status === "accepted");
  if (!version) {
    const clientMember = (await db.select().from(memberships).where(and(eq(memberships.projectId, input.projectId), eq(memberships.role, "client"), eq(memberships.status, "active"))))[0];
    const next = clientMember ? await nextStep(db, input.projectId, clientMember.userId, "client") : null;
    return stop({ code: "plan_not_agreed", message: "Both sides must accept the plan before money can be locked.", next });
  }
  let roles: Awaited<ReturnType<typeof projectRoleWallets>>;
  try {
    roles = await projectRoleWallets(db, input.projectId);
  } catch (error) {
    if (error instanceof ConsultantRequired) {
      return stop({ code: "people_missing", message: "Consultant hasn't joined yet.", next: "Tap Invite people." });
    }
    if (error instanceof Error && /need to join/.test(error.message)) {
      const message = /contractor/i.test(error.message) && !/client and the contractor/i.test(error.message)
        ? "Contractor hasn't joined yet."
        : "Client hasn't joined yet.";
      const both = /client and the contractor/i.test(error.message);
      return stop({ code: "people_missing", message: both ? "Client hasn't joined yet." : message, next: "Tap Invite people." });
    }
    throw error;
  }
  const inflight = (await db.select().from(chainTxs).where(eq(chainTxs.projectId, input.projectId))).find(
    (row) => (row.kind === "approve_usdc" || row.kind === "fund") && (row.status === "pending" || row.status === "submitted"),
  );
  if (inflight) return stop({ code: "lock_in_progress", message: "Locking is already on its way. Check again in a minute." });
  const stageRows = await db.select().from(stages).where(eq(stages.projectId, input.projectId));
  const needed = project.escrowAddress
    ? await port.quoteFund(project.escrowAddress as Hex, input.upToStage)
    : expectedFundMicro(stageRows, input.upToStage);
  if (needed === 0n) return stop({ code: "nothing_to_fund", message: "Those stages are already locked." });
  const held = await port.erc20Balance(usdcAddress(), roles.client.address);
  if (held < needed) {
    return stop({
      code: "needs_usdc",
      message: `The client payment account holds ${usdcAmount(held)} USDC and needs ${usdcAmount(needed)} USDC. Nothing was sent.`,
      next: `Add test USDC on Ethereum Sepolia to ${roles.client.address} (faucet.circle.com), then tap Lock again.`,
      neededMicro: needed,
      heldMicro: held,
      clientAddress: roles.client.address,
      faucetUrl: "https://faucet.circle.com/",
    });
  }
  const treasury = await getOrCreateWallet(db, { purpose: "treasury" });
  const balances = await Promise.all([roles.operator.address, roles.client.address, roles.contractor.address].map((address) => port.ethBalance(address)));
  const low = balances.filter((balance) => balance < GAS_FLOOR).length;
  const treasuryEth = await port.ethBalance(treasury.address);
  if (treasuryEth < BigInt(low + 1) * GAS_TOPUP) {
    console.log(JSON.stringify({ msg: "treasury gas low", projectId: input.projectId }));
    return stop({ code: "gas_low", message: "Certa can't pay the network fee right now. Nothing was sent. Try again later.", neededMicro: needed, heldMicro: held, clientAddress: roles.client.address });
  }
  let resumeFrom: LockCheck["resumeFrom"] = "fund";
  if (!project.escrowAddress) resumeFrom = "escrow";
  else {
    const snap = await port.escrowSnapshot(project.escrowAddress as Hex);
    if (!snap.clientAccepted || !snap.contractorAccepted) resumeFrom = "accept";
    else {
      const allowance = await port.allowance(usdcAddress(), roles.client.address, project.escrowAddress as Hex);
      if (allowance < needed) resumeFrom = "approve";
    }
  }
  return {
    ready: true,
    code: "ready",
    message: "Ready to lock.",
    next: null,
    neededMicro: needed,
    heldMicro: held,
    clientAddress: roles.client.address,
    faucetUrl: null,
    resumeFrom,
  };
}

function usdcAddress(): Hex {
  const address = process.env.USDC_ADDRESS || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  return address as Hex;
}
