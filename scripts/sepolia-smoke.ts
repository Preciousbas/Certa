import "./sepolia-dns.mjs";
import { readFileSync } from "node:fs";
import { certaEscrowFullAbi, cdpConfigured, encodeCall, ensureOperatorPolicy, USDC_SEPOLIA, type Hex } from "@certa/chain";
import {
  chainTxs,
  contractAcceptances,
  contractVersions,
  createMemoryDatabase,
  issueJoinCode,
  redeemJoinCode,
  stages,
  startOwnProject,
  users,
} from "@certa/db";
import { SEPOLIA_CHAIN_ID, explorerAddress, explorerTx } from "../src/server/chain/networks.js";
import { defaultPort } from "../src/server/chain/port.js";
import { addTestUsdc, fundAccepted, projectRoleWallets, submitStageTx, topUpIfLow } from "../src/server/chain/flows.js";
import { sendTx, waitForTx } from "../src/server/chain/tx.js";

function loadEnv(path: string) {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function link(hash: string | null | undefined) {
  return hash && /^0x[a-fA-F0-9]{64}$/.test(hash) ? explorerTx(SEPOLIA_CHAIN_ID, hash) : "(no transaction)";
}

loadEnv(new URL("../.env", import.meta.url).pathname);
process.env.CHAIN_LIVE = "1";
process.env.CHAIN_ID = String(SEPOLIA_CHAIN_ID);
if (!process.env.CERTA_ENV) process.env.CERTA_ENV = "dev";

const SMOKE_CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const SMOKE_CONTRACTOR_ID = "22222222-2222-4222-8222-222222222222";
const SMOKE_CONSULTANT_ID = "33333333-3333-4333-8333-333333333333";

if (!cdpConfigured()) {
  console.error("CDP keys are not configured. The Sepolia smoke test was not sent.");
  process.exit(1);
}

const evidence = `0x${"11".repeat(32)}` as Hex;

async function main() {
const { db, close } = await createMemoryDatabase();
try {
  await db.insert(users).values([
    { id: SMOKE_CLIENT_ID, telegramId: 91001n, name: "Smoke Client" },
    { id: SMOKE_CONTRACTOR_ID, telegramId: 91002n, name: "Smoke Contractor" },
    { id: SMOKE_CONSULTANT_ID, telegramId: 91003n, name: "Smoke Consultant" },
  ]);
  const client = await startOwnProject(db, { telegramId: 91001n, name: "Smoke Client", projectName: "Throwaway escrow", role: "client" });
  const contractorCode = await issueJoinCode(db, { projectId: client.projectId, workspaceId: client.workspaceId, role: "main_contractor" });
  const consultantCode = await issueJoinCode(db, { projectId: client.projectId, workspaceId: client.workspaceId, role: "consultant" });
  const contractor = await redeemJoinCode(db, { telegramId: 91002n, name: "Smoke Contractor", code: contractorCode.code });
  const consultant = await redeemJoinCode(db, { telegramId: 91003n, name: "Smoke Consultant", code: consultantCode.code });
  if (!contractor.ok || !consultant.ok) throw new Error("The throwaway roles did not join.");
  const contentHash = "ab".repeat(32);
  const [version] = await db
    .insert(contractVersions)
    .values({
      projectId: client.projectId,
      version: 1,
      status: "accepted",
      contractSumKobo: 7_000_000n,
      koboPerUsdc: 133_111n,
      fxSource: "manual",
      fxAsOf: "2026-10-21",
      spendingCapMicro: 5_000_000n,
      terms: {},
      documentHashes: [contentHash],
      contentHash,
      createdBy: client.userId,
      retentionBps: 500,
      defectsPeriodDays: 180,
    })
    .returning();
  if (!version) throw new Error("The throwaway contract was not stored.");
  await db.insert(contractAcceptances).values([
    { contractVersionId: version.id, userId: client.userId, role: "client", decision: "accepted", contentHash },
    { contractVersionId: version.id, userId: contractor.ok ? client.userId : client.userId, role: "contractor", decision: "accepted", contentHash },
  ]);
  const stageRows = await db.insert(stages).values([
    {
      projectId: client.projectId,
      workspaceId: client.workspaceId,
      contractVersionId: version.id,
      stageIndex: 0,
      onChainIdx: 0,
      name: "Stage 1",
      amountNgnKobo: 133_111n,
      amountUsdc: 1_000_000n,
      retentionBps: 500,
      status: "not_started",
    },
    {
      projectId: client.projectId,
      workspaceId: client.workspaceId,
      contractVersionId: version.id,
      stageIndex: 1,
      onChainIdx: 1,
      name: "Stage 2",
      amountNgnKobo: 798_666n,
      amountUsdc: 6_000_000n,
      retentionBps: 500,
      status: "not_started",
    },
  ]).returning();
  const aboveCap = stageRows.find((stage) => stage.onChainIdx === 1);
  if (!aboveCap) throw new Error("The throwaway stage was not stored.");
  const roles = await projectRoleWallets(db, client.projectId);
  console.log("reused", roles.client.accountRef, roles.client.address, explorerAddress(SEPOLIA_CHAIN_ID, roles.client.address));
  console.log("reused", roles.consultant.accountRef, roles.consultant.address, explorerAddress(SEPOLIA_CHAIN_ID, roles.consultant.address));
  console.log("reused", roles.operator.accountRef, roles.operator.address, explorerAddress(SEPOLIA_CHAIN_ID, roles.operator.address));
  console.log("reused", roles.contractor.accountRef, roles.contractor.address, explorerAddress(SEPOLIA_CHAIN_ID, roles.contractor.address));
  const policy = await ensureOperatorPolicy(roles.operator.address, [
    (process.env.ESCROW_FACTORY_ADDRESS ?? "") as Hex,
    (process.env.USDC_ADDRESS ?? "") as Hex,
  ]);
  console.log("operator policy", policy.note, policy.policyId ?? "");
  const port = defaultPort();
  const gasReady = 1_000_000_000_000_000n;
  for (const wallet of [roles.operator, roles.client, roles.contractor]) {
    const balance = await port.ethBalance(wallet.address);
    if (balance >= gasReady) {
      console.log("topup", wallet.purpose, "already funded");
      continue;
    }
    const topped = await topUpIfLow(db, wallet.address, client.projectId, port);
    if (!topped) continue;
    const done = await waitForTx(db, topped.id, port);
    console.log("topup", wallet.purpose, link(done?.txHash), done?.status ?? "", done?.error ?? "");
  }
  const fundAmount = 7_000_000n;
  const token = (process.env.USDC_ADDRESS || USDC_SEPOLIA) as Hex;
  const held = await port.erc20Balance(token, roles.client.address);
  if (held < fundAmount) {
    const seeded = await addTestUsdc(db, client.projectId, fundAmount - held, port);
    const seedTx = await waitForTx(db, seeded.id, port);
    console.log("test money", link(seedTx?.txHash), seedTx?.status ?? "", seedTx?.error ?? "");
  } else {
    console.log("test money already on the client account");
  }
  const funded = await fundAccepted(db, { projectId: client.projectId, upToStage: 1, idempotencyKey: `smoke-fund-${version.id}` }, port);
  const fundTx = await waitForTx(db, funded.tx.id, port);
  console.log("escrow", funded.escrow, explorerAddress(SEPOLIA_CHAIN_ID, funded.escrow));
  console.log("fund", link(fundTx?.txHash), fundTx?.status ?? "");
  const widened = await ensureOperatorPolicy(roles.operator.address, [
    (process.env.ESCROW_FACTORY_ADDRESS ?? "") as Hex,
    (process.env.USDC_ADDRESS ?? "") as Hex,
    funded.escrow,
  ]);
  console.log("operator policy", widened.note, widened.policyId ?? "");
  const underCap = stageRows.find((stage) => stage.onChainIdx === 0);
  if (!underCap) throw new Error("The throwaway stage was not stored.");
  const submittedUnder = await submitStageTx(
    db,
    { projectId: client.projectId, stageId: underCap.id, submissionId: `${version.id}:under`, evidenceHash: evidence, stageIndex: 0 },
    port,
  );
  const submitUnderTx = await waitForTx(db, submittedUnder.id, port);
  console.log("submit under cap", link(submitUnderTx?.txHash));
  const approved = await sendTx(
    db,
    {
      kind: "client_approve",
      idempotencyKey: `client_approve:smoke:${version.id}:under`,
      accountName: roles.client.accountRef,
      from: roles.client.address,
      to: funded.escrow,
      data: encodeCall(certaEscrowFullAbi, "clientApprove", [0n]),
      projectId: client.projectId,
      intent: { event: "ClientApproved", stageIndex: 0 },
    },
    port,
  );
  const approveTx = await waitForTx(db, approved.id, port);
  console.log("approve under cap", link(approveTx?.txHash));
  const released = await sendTx(
    db,
    {
      kind: "release_stage",
      idempotencyKey: `release_stage:smoke:${version.id}:under`,
      accountName: roles.operator.accountRef,
      from: roles.operator.address,
      to: funded.escrow,
      data: encodeCall(certaEscrowFullAbi, "releaseStage", [0n]),
      projectId: client.projectId,
      intent: { event: "StageReleased", stageIndex: 0 },
    },
    port,
  );
  const releaseTx = await waitForTx(db, released.id, port);
  console.log("release under cap", link(releaseTx?.txHash));
  const submittedOver = await submitStageTx(
    db,
    { projectId: client.projectId, stageId: aboveCap.id, submissionId: `${version.id}:over`, evidenceHash: evidence, stageIndex: 1 },
    port,
  );
  const submitOverTx = await waitForTx(db, submittedOver.id, port);
  console.log("submit above cap", link(submitOverTx?.txHash));
  const blocked = await sendTx(
    db,
    {
      kind: "release_stage",
      idempotencyKey: `release_stage:smoke:${version.id}:above`,
      accountName: roles.operator.accountRef,
      from: roles.operator.address,
      to: funded.escrow,
      data: encodeCall(certaEscrowFullAbi, "releaseStage", [1n]),
      projectId: client.projectId,
      intent: { event: "StageReleased", stageIndex: 1 },
    },
    port,
  );
  console.log("cap message", blocked.error);
  console.log("cap broadcast", blocked.txHash ?? "(none)");
  const repeat = await sendTx(
    db,
    {
      kind: "release_stage",
      idempotencyKey: `release_stage:smoke:${version.id}:under`,
      accountName: roles.operator.accountRef,
      from: roles.operator.address,
      to: funded.escrow,
      data: encodeCall(certaEscrowFullAbi, "releaseStage", [0n]),
      projectId: client.projectId,
      intent: { event: "StageReleased", stageIndex: 0 },
    },
    port,
  );
  console.log("repeat same tx", repeat.txHash === releaseTx?.txHash, link(repeat.txHash));
} catch (error) {
  console.error(error instanceof Error ? error.message : "The Sepolia smoke test failed.");
  process.exitCode = 1;
} finally {
  const sent = await db.select().from(chainTxs);
  for (const tx of sent) console.log("tx", tx.kind, tx.status, link(tx.txHash));
  await close();
}
}

main();
