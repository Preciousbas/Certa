import {
  encodeCall,
  erc20Abi,
  escrowFactoryAbi,
  certaEscrowFullAbi,
  projectBytes32,
  readEscrowSnapshot,
  termsBytes32,
  USDC_SEPOLIA,
  type Hex,
} from "@certa/chain";
import {
  contractAcceptances,
  contractVersions,
  memberships,
  projects,
  stages,
  usageLedger,
  type Database,
} from "@certa/db";
import { and, eq } from "drizzle-orm";
import { audit } from "../audit.js";
import { enqueueJob } from "../jobs/enqueue.js";
import { SEPOLIA_CHAIN_ID } from "./networks.js";
import { defaultPort, type ChainPort } from "./port.js";
import { sendTx, waitForTx } from "./tx.js";
import { assertRolesDistinct, ConsultantRequired, getOrCreateWallet, type RoleWallet } from "./wallets.js";

export { ConsultantRequired };

const GAS_FLOOR = 10_000_000_000_000_000n;
const DAY_SECONDS = 86_400n;

export class ChainRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainRejected";
  }
}

function usdc(): Hex {
  const address = process.env.USDC_ADDRESS || USDC_SEPOLIA;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("USDC_ADDRESS is invalid");
  return address as Hex;
}

function factory(): Hex {
  const address = process.env.ESCROW_FACTORY_ADDRESS ?? "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("ESCROW_FACTORY_ADDRESS is invalid");
  return address as Hex;
}

async function memberUser(db: Database, projectId: string, role: string): Promise<string | null> {
  const rows = await db.select().from(memberships).where(and(eq(memberships.projectId, projectId), eq(memberships.role, role), eq(memberships.status, "active")));
  return rows[0]?.userId ?? null;
}

export async function projectRoleWallets(db: Database, projectId: string) {
  const clientUser = await memberUser(db, projectId, "client");
  const consultantUser = await memberUser(db, projectId, "consultant");
  const contractorUser = await memberUser(db, projectId, "contractor");
  if (!clientUser || !contractorUser) throw new ChainRejected("Both the client and the contractor need to join before money can be locked.");
  if (!consultantUser) throw new ConsultantRequired();
  const [client, consultant, contractor, operator] = await Promise.all([
    getOrCreateWallet(db, { purpose: "client", userId: clientUser, projectId }),
    getOrCreateWallet(db, { purpose: "consultant", userId: consultantUser, projectId }),
    getOrCreateWallet(db, { purpose: "contractor", userId: contractorUser, projectId }),
    getOrCreateWallet(db, { purpose: "operator" }),
  ]);
  assertRolesDistinct({
    client: client.address,
    consultant: consultant.address,
    operator: operator.address,
    contractor: contractor.address,
  });
  return { client, consultant, contractor, operator };
}

async function requireTx(db: Database, sent: { status: string; error: string | null; txHash: string | null; id: string }, port: ChainPort) {
  if (sent.status === "failed") throw new ChainRejected(sent.error ?? "The payment didn't go through.");
  const done = await waitForTx(db, sent.id, port);
  if (!done || done.status === "failed") throw new ChainRejected(done?.error ?? "The payment didn't go through.");
  if (done.status !== "confirmed") throw new ChainRejected(done.error ?? "The payment is still waiting for confirmation.");
  return done;
}

export async function ensureEscrow(db: Database, projectId: string, port: ChainPort = defaultPort()) {
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
  if (!project) throw new Error("That project is not available.");
  if (project.escrowAddress && /^0x[a-fA-F0-9]{40}$/.test(project.escrowAddress)) return project.escrowAddress as Hex;
  const versionId = project.currentContractVersionId;
  const versions = await db.select().from(contractVersions).where(eq(contractVersions.projectId, projectId));
  const version = versions.find((row) => row.id === versionId) ?? versions.find((row) => row.status === "accepted");
  if (!version || version.status !== "accepted") throw new ChainRejected("Both sides accept the schedule before money can be locked.");
  const roles = await projectRoleWallets(db, projectId);
  const work = (await db.select().from(stages).where(eq(stages.projectId, projectId)))
    .filter((stage) => stage.contractVersionId === version.id && stage.kind !== "mobilisation")
    .sort((a, b) => a.stageIndex - b.stageIndex);
  if (work.length === 0) throw new ChainRejected("This contract has no payment stages.");
  const mobilisation = (await db.select().from(stages).where(eq(stages.projectId, projectId)))
    .filter((stage) => stage.contractVersionId === version.id && stage.kind === "mobilisation")
    .reduce((sum, stage) => sum + stage.amountUsdc, 0n);
  const data = encodeCall(escrowFactoryAbi, "createEscrow", [
    {
      client: roles.client.address,
      contractor: roles.contractor.address,
      consultant: roles.consultant.address,
      operator: roles.operator.address,
      admin: roles.operator.address,
      token: usdc(),
      stageAmounts: work.map((stage) => stage.amountUsdc),
      retentionBps: version.retentionBps,
      mobilisationAmount: mobilisation > 0n ? mobilisation : (version.advanceKobo * 1_000_000n) / version.koboPerUsdc,
      spendingCap: version.spendingCapMicro,
      termsHash: termsBytes32(version.contentHash),
      defectsPeriodSeconds: BigInt(version.defectsPeriodDays) * DAY_SECONDS,
      projectId: projectBytes32(projectId),
    },
  ]);
  const sent = await sendTx(db, {
    kind: "create_escrow",
    idempotencyKey: `create_escrow:${version.id}`,
    accountName: roles.operator.accountRef,
    from: roles.operator.address,
    to: factory(),
    data,
    projectId,
    workspaceId: project.workspaceId,
    intent: { event: "EscrowCreated", contractVersionId: version.id },
  }, port);
  const done = await requireTx(db, sent, port);
  const fresh = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
  if (fresh?.escrowAddress && /^0x[a-fA-F0-9]{40}$/.test(fresh.escrowAddress)) return fresh.escrowAddress as Hex;
  if (done.txHash) {
    const receipt = await port.receipt(done.txHash as Hex);
    const created = receipt?.logs.find((log) => log.eventName === "EscrowCreated");
    const address = created?.args.escrow;
    if (typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address)) return address as Hex;
  }
  throw new ChainRejected("The escrow was not created.");
}

async function acceptIfNeeded(db: Database, projectId: string, escrow: Hex, versionId: string, wallet: RoleWallet, role: "client" | "contractor", port: ChainPort) {
  const view = await port.escrowSnapshot(escrow);
  if (role === "client" && view.clientAccepted) return;
  if (role === "contractor" && view.contractorAccepted) return;
  const acceptance = (
    await db.select().from(contractAcceptances).where(eq(contractAcceptances.contractVersionId, versionId))
  ).find((row) => row.role === role && row.decision === "accepted");
  if (!acceptance) throw new ChainRejected("Both sides accept the schedule before money can be locked.");
  const sent = await sendTx(db, {
    kind: "accept_terms",
    idempotencyKey: `accept_terms:${versionId}:${role}`,
    accountName: wallet.accountRef,
    from: wallet.address,
    to: escrow,
    data: encodeCall(certaEscrowFullAbi, "acceptTerms"),
    projectId,
    intent: { event: "TermsAccepted" },
  }, port);
  await requireTx(db, sent, port);
}

export async function fundAccepted(db: Database, input: { projectId: string; upToStage: number; idempotencyKey: string }, port: ChainPort = defaultPort()) {
  const project = (await db.select().from(projects).where(eq(projects.id, input.projectId)))[0];
  if (!project) throw new Error("That project is not available.");
  if (project.status === "paused") throw new Error("This project is paused.");
  const roles = await projectRoleWallets(db, input.projectId);
  await enqueueJob(db, { kind: "gas_topup", payload: { address: roles.client.address, projectId: input.projectId }, dedupeKey: `gas:${roles.client.address}` });
  const escrow = await ensureEscrow(db, input.projectId, port);
  const version = (await db.select().from(contractVersions).where(eq(contractVersions.projectId, input.projectId))).find((row) => row.status === "accepted");
  if (!version) throw new ChainRejected("Both sides accept the schedule before money can be locked.");
  await acceptIfNeeded(db, input.projectId, escrow, version.id, roles.client, "client", port);
  await acceptIfNeeded(db, input.projectId, escrow, version.id, roles.contractor, "contractor", port);
  const amount = await port.quoteFund(escrow, input.upToStage);
  if (amount === 0n) throw new ChainRejected("That range has nothing left to fund.");
  const allowance = await port.allowance(usdc(), roles.client.address, escrow);
  if (allowance < amount) {
    const approved = await sendTx(db, {
      kind: "approve_usdc",
      idempotencyKey: `approve_usdc:${input.idempotencyKey}`,
      accountName: roles.client.accountRef,
      from: roles.client.address,
      to: usdc(),
      data: encodeCall(erc20Abi, "approve", [escrow, amount]),
      projectId: input.projectId,
      valueMicro: amount,
      intent: { event: "Approval" },
    }, port);
    await requireTx(db, approved, port);
  }
  const funded = await sendTx(db, {
    kind: "fund",
    idempotencyKey: `fund:${input.idempotencyKey}`,
    accountName: roles.client.accountRef,
    from: roles.client.address,
    to: escrow,
    data: encodeCall(certaEscrowFullAbi, "fund", [amount, input.upToStage]),
    projectId: input.projectId,
    valueMicro: amount,
    intent: { event: "Funded", upToStage: input.upToStage },
  }, port);
  const done = await requireTx(db, funded, port);
  return { tx: done, amount, escrow };
}

export async function submitStageTx(db: Database, input: { projectId: string; stageId: string; submissionId: string; evidenceHash: Hex; stageIndex: number }, port: ChainPort = defaultPort()) {
  const roles = await projectRoleWallets(db, input.projectId);
  const escrow = await ensureEscrow(db, input.projectId, port);
  const sent = await sendTx(db, {
    kind: "submit_stage",
    idempotencyKey: `submit_stage:${input.submissionId}`,
    accountName: roles.operator.accountRef,
    from: roles.operator.address,
    to: escrow,
    data: encodeCall(certaEscrowFullAbi, "submitStage", [BigInt(input.stageIndex), input.evidenceHash]),
    projectId: input.projectId,
    stageId: input.stageId,
    intent: { event: "StageSubmitted", stageIndex: input.stageIndex },
  }, port);
  return requireTx(db, sent, port);
}

export async function releaseStageTx(
  db: Database,
  input: { projectId: string; stageId: string; approvalId: string; stageIndex: number; amountMicro: bigint; capMicro: bigint },
  port: ChainPort = defaultPort(),
) {
  const project = (await db.select().from(projects).where(eq(projects.id, input.projectId)))[0];
  if (project?.status === "paused") throw new Error("This project is paused.");
  const roles = await projectRoleWallets(db, input.projectId);
  const escrow = await ensureEscrow(db, input.projectId, port);
  if (input.amountMicro > input.capMicro) {
    const approval = await sendTx(db, {
      kind: "client_approve",
      idempotencyKey: `client_approve:${input.stageId}:${input.approvalId}`,
      accountName: roles.client.accountRef,
      from: roles.client.address,
      to: escrow,
      data: encodeCall(certaEscrowFullAbi, "clientApprove", [BigInt(input.stageIndex)]),
      projectId: input.projectId,
      stageId: input.stageId,
      intent: { event: "ClientApproved", stageIndex: input.stageIndex, approvalId: input.approvalId },
    }, port);
    await requireTx(db, approval, port);
  }
  const released = await sendTx(db, {
    kind: "release_stage",
    idempotencyKey: `release_stage:${input.stageId}:${input.approvalId}`,
    accountName: roles.operator.accountRef,
    from: roles.operator.address,
    to: escrow,
    data: encodeCall(certaEscrowFullAbi, "releaseStage", [BigInt(input.stageIndex)]),
    projectId: input.projectId,
    stageId: input.stageId,
    intent: { event: "StageReleased", stageIndex: input.stageIndex, approvalId: input.approvalId },
  }, port);
  return requireTx(db, released, port);
}

export async function disputeTx(db: Database, input: { projectId: string; stageId: string; stageIndex: number; reason: string; from: "client" | "contractor" }, port: ChainPort = defaultPort()) {
  const roles = await projectRoleWallets(db, input.projectId);
  const wallet = input.from === "client" ? roles.client : roles.contractor;
  const escrow = await ensureEscrow(db, input.projectId, port);
  const reasonHash = projectBytes32(input.reason);
  const sent = await sendTx(db, {
    kind: "dispute",
    idempotencyKey: `dispute:${input.stageId}:${reasonHash}`,
    accountName: wallet.accountRef,
    from: wallet.address,
    to: escrow,
    data: encodeCall(certaEscrowFullAbi, "dispute", [BigInt(input.stageIndex), reasonHash]),
    projectId: input.projectId,
    stageId: input.stageId,
    intent: { event: "StageDisputed", stageIndex: input.stageIndex },
  }, port);
  return requireTx(db, sent, port);
}

export async function topUpIfLow(db: Database, address: Hex, projectId: string, port: ChainPort = defaultPort()) {
  const balance = await port.ethBalance(address);
  if (balance >= GAS_FLOOR) return null;
  const treasury = await getOrCreateWallet(db, { purpose: "treasury" });
  const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
  const sent = await sendTx(db, {
    kind: "gas_topup",
    idempotencyKey: `gas_topup:${address}:${new Date().toISOString().slice(0, 13)}`,
    accountName: treasury.accountRef,
    from: treasury.address,
    to: address,
    data: "0x",
    projectId,
    valueWei: GAS_FLOOR,
    valueMicro: GAS_FLOOR,
    intent: { event: "NativeTransfer" },
  }, port);
  if (project) {
    await db.insert(usageLedger).values({
      workspaceId: project.workspaceId,
      projectId,
      kind: "network_fee",
      amountUsdc: 0n,
      period: new Date().toISOString().slice(0, 7),
    });
    await audit(db, {
      action: "wallet.topup",
      entity: "wallets",
      entityId: address,
      projectId,
      workspaceId: project.workspaceId,
      actorKind: "system",
      reason: "The payment account was topped up from the treasury.",
    });
  }
  return sent;
}

export async function addTestUsdc(db: Database, projectId: string, amount: bigint, port: ChainPort = defaultPort()) {
  if ((process.env.CHAIN_ID && process.env.CHAIN_ID !== String(SEPOLIA_CHAIN_ID)) || process.env.CERTA_ENV === "production") {
    throw new ChainRejected("Test money is only available on the test network.");
  }
  const roles = await projectRoleWallets(db, projectId);
  const treasury = await getOrCreateWallet(db, { purpose: "treasury" });
  const sent = await sendTx(db, {
    kind: "fund",
    idempotencyKey: `test_usdc:${projectId}:${roles.client.address}`,
    accountName: treasury.accountRef,
    from: treasury.address,
    to: usdc(),
    data: encodeCall(erc20Abi, "transfer", [roles.client.address, amount]),
    projectId,
    valueMicro: amount,
    intent: { event: "Transfer" },
  }, port);
  return requireTx(db, sent, port);
}

export async function liveSnapshot(escrow: Hex) {
  return readEscrowSnapshot(escrow);
}
