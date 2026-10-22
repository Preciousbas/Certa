import "./sepolia-dns.mjs";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { cdpConfigured, ensureOperatorPolicy, USDC_SEPOLIA, type Hex } from "@certa/chain";
import {
  aiVerdicts,
  chainTxs,
  contractAcceptances,
  contractVersions,
  createMemoryDatabase,
  issueJoinCode,
  projects,
  redeemJoinCode,
  stages,
  startOwnProject,
  submissions,
  users,
} from "@certa/db";
import { eq } from "drizzle-orm";
import { SEPOLIA_CHAIN_ID, explorerAddress, explorerTx } from "../src/server/chain/networks.js";
import { defaultPort } from "../src/server/chain/port.js";
import { addTestUsdc, fundAccepted, projectRoleWallets, topUpIfLow } from "../src/server/chain/flows.js";
import { waitForTx } from "../src/server/chain/tx.js";
import { issueCaptureNonce, sendCaptureSet, storeCapturePhoto } from "../src/server/verify/capture.js";
import { applyAiOverride } from "../src/server/verify/override.js";
import { defaultSubmitStage } from "../src/server/verify/run.js";
import { drainJobs } from "../src/server/jobs/worker.js";
import { registerVerifyJobs } from "../src/server/verify/register.js";

function loadEnv(file: string) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqAt = trimmed.indexOf("=");
    if (eqAt < 1) continue;
    const key = trimmed.slice(0, eqAt);
    let value = trimmed.slice(eqAt + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function link(hash: string | null | undefined) {
  return hash && /^0x[a-fA-F0-9]{64}$/.test(hash) ? explorerTx(SEPOLIA_CHAIN_ID, hash) : "(no transaction)";
}

loadEnv(new URL("../.env", import.meta.url).pathname);
delete process.env.TELEGRAM_BOT_TOKEN;
process.env.CHAIN_LIVE = "1";
process.env.CHAIN_ID = String(SEPOLIA_CHAIN_ID);
if (!process.env.CERTA_ENV) process.env.CERTA_ENV = "dev";

const SITE = { lat: 6.4474, lng: 3.4723 };

async function photoBytes(seed: number): Promise<Uint8Array> {
  const root = path.join(process.cwd(), "tests/fixtures/stage-photos");
  let source: Buffer | null = null;
  try {
    const files = readdirSync(root).filter((name) => name.endsWith(".jpg") && name.startsWith("stage-2-"));
    const picked = files[seed];
    if (picked) source = readFileSync(path.join(root, picked));
  } catch {
    source = null;
  }
  if (!source) {
    const width = 1280;
    const height = 960;
    const raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 3;
        const on = ((x >> 4) + (y >> 4) + seed) % 2 === 0;
        raw[i] = on ? 220 : 30;
        raw[i + 1] = on ? 200 : 48;
        raw[i + 2] = 40 + seed * 30;
      }
    }
    source = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
  }
  const marked = await sharp(source)
    .resize({ width: 1280, height: 960, fit: "cover" })
    .composite([
      {
        input: await sharp({
          create: { width: 180, height: 80, channels: 3, background: { r: 20 + seed * 40, g: 90, b: 40 } },
        })
          .jpeg()
          .toBuffer(),
        left: 40 + seed * 30,
        top: 40,
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
  return Uint8Array.from(marked);
}

async function main() {
  if (!cdpConfigured()) {
    process.stderr.write("CDP keys are not configured. No Sepolia submitStage was sent.\n");
    process.exit(1);
  }
  const { db, close } = await createMemoryDatabase();
  try {
    await db.insert(users).values([
      { id: "11111111-1111-4111-8111-111111111111", telegramId: 91001n, name: "Smoke Client" },
      { id: "22222222-2222-4222-8222-222222222222", telegramId: 91002n, name: "Smoke Contractor" },
      { id: "33333333-3333-4333-8333-333333333333", telegramId: 91003n, name: "Smoke Consultant" },
    ]);
    const client = await startOwnProject(db, {
      telegramId: 91001n,
      name: "Smoke Client",
      projectName: "Photo verify escrow",
      role: "client",
      site: "Lekki, Lagos",
    });
    await db.update(projects).set({ siteLat: SITE.lat, siteLng: SITE.lng, geofenceRadiusM: 150 }).where(eq(projects.id, client.projectId));
    const contractorCode = await issueJoinCode(db, { projectId: client.projectId, workspaceId: client.workspaceId, role: "main_contractor" });
    const consultantCode = await issueJoinCode(db, { projectId: client.projectId, workspaceId: client.workspaceId, role: "consultant" });
    const contractor = await redeemJoinCode(db, { telegramId: 91002n, name: "Smoke Contractor", code: contractorCode.code });
    const consultant = await redeemJoinCode(db, { telegramId: 91003n, name: "Smoke Consultant", code: consultantCode.code });
    if (!contractor.ok || !consultant.ok) throw new Error("The throwaway roles did not join.");
    const contentHash = "cd".repeat(32);
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
      { contractVersionId: version.id, userId: client.userId, role: "contractor", decision: "accepted", contentHash },
    ]);
    const [stage] = await db
      .insert(stages)
      .values({
        projectId: client.projectId,
        workspaceId: client.workspaceId,
        contractVersionId: version.id,
        stageIndex: 0,
        onChainIdx: 0,
        name: "Excavation and foundation",
        amountNgnKobo: 133_111n,
        amountUsdc: 1_000_000n,
        retentionBps: 500,
        status: "not_started",
        acceptanceCriteria: ["The photos show excavation or foundation work for this stage."],
      })
      .returning();
    if (!stage) throw new Error("The throwaway stage was not stored.");
    const roles = await projectRoleWallets(db, client.projectId);
    const port = defaultPort();
    await ensureOperatorPolicy(roles.operator.address, [
      (process.env.ESCROW_FACTORY_ADDRESS ?? "") as Hex,
      (process.env.USDC_ADDRESS ?? "") as Hex,
    ]);
    const gasReady = 1_000_000_000_000_000n;
    for (const wallet of [roles.operator, roles.client, roles.contractor]) {
      const balance = await port.ethBalance(wallet.address);
      if (balance >= gasReady) continue;
      const topped = await topUpIfLow(db, wallet.address, client.projectId, port);
      if (!topped) continue;
      await waitForTx(db, topped.id, port);
    }
    const fundAmount = 1_000_000n;
    const token = (process.env.USDC_ADDRESS || USDC_SEPOLIA) as Hex;
    const held = await port.erc20Balance(token, roles.client.address);
    if (held < fundAmount) {
      const seeded = await addTestUsdc(db, client.projectId, fundAmount - held, port);
      await waitForTx(db, seeded.id, port);
    }
    const funded = await fundAccepted(db, { projectId: client.projectId, upToStage: 0, idempotencyKey: `verify-fund-${version.id}` }, port);
    const fundTx = await waitForTx(db, funded.tx.id, port);
    process.stdout.write(`fund ${link(fundTx?.txHash)} ${fundTx?.status ?? ""}\n`);
    process.stdout.write(`escrow ${explorerAddress(SEPOLIA_CHAIN_ID, funded.escrow)}\n`);
    await ensureOperatorPolicy(roles.operator.address, [
      (process.env.ESCROW_FACTORY_ADDRESS ?? "") as Hex,
      (process.env.USDC_ADDRESS ?? "") as Hex,
      funded.escrow,
    ]);
    await db.update(stages).set({ funded: true }).where(eq(stages.id, stage.id));
    const contractorUser = (await db.select().from(users).where(eq(users.telegramId, 91002n)))[0];
    const consultantUser = (await db.select().from(users).where(eq(users.telegramId, 91003n)))[0];
    if (!contractorUser || !consultantUser) throw new Error("The throwaway users were not stored.");
    const nonce = await issueCaptureNonce(db, { projectId: client.projectId, userId: contractorUser.id, stageId: stage.id });
    if ("error" in nonce) throw new Error(nonce.error);
    for (let seed = 0; seed < 3; seed += 1) {
      const stored = await storeCapturePhoto(db, {
        projectId: client.projectId,
        workspaceId: client.workspaceId,
        userId: contractorUser.id,
        stageId: stage.id,
        nonce: nonce.nonce,
        capturedAtMs: Date.now() + 1_000,
        lat: SITE.lat,
        lng: SITE.lng,
        accuracyM: 8,
        deviceInfo: "sepolia-verify-submit",
        bytes: await photoBytes(seed),
        site: SITE,
        radiusM: 150,
      });
      if (!stored.accepted) throw new Error(stored.message);
    }
    const sent = await sendCaptureSet(db, {
      projectId: client.projectId,
      workspaceId: client.workspaceId,
      userId: contractorUser.id,
      stageId: stage.id,
      nonce: nonce.nonce,
    });
    if (!sent.ok) throw new Error(sent.message);
    registerVerifyJobs();
    await drainJobs(5);
    const verdict = (await db.select().from(aiVerdicts).where(eq(aiVerdicts.submissionId, sent.submissionId)))[0];
    const submission = (await db.select().from(submissions).where(eq(submissions.id, sent.submissionId)))[0];
    process.stdout.write(`verdict ${JSON.stringify(verdict?.rawJson ?? null)}\n`);
    const stageNow = (await db.select().from(stages).where(eq(stages.id, stage.id)))[0];
    let txHash: string | null =
      (await db.select().from(chainTxs).where(eq(chainTxs.idempotencyKey, `submit_stage:${sent.submissionId}`)))[0]?.txHash ?? null;
    if (stageNow?.status === "awaiting_certification") {
      process.stdout.write("path model pass\n");
    } else {
      const overridden = await applyAiOverride(db, {
        projectId: client.projectId,
        workspaceId: client.workspaceId,
        stageId: stage.id,
        userId: consultantUser.id,
        reason: "The photos show the foundation work and the consultant is sending this stage on.",
        submit: defaultSubmitStage,
      });
      txHash = overridden.txHash ?? txHash;
      process.stdout.write("path consultant override after the model verdict\n");
    }
    if (!txHash && submission?.evidenceHash?.startsWith("0x")) {
      const submitted = await defaultSubmitStage(db, {
        projectId: client.projectId,
        stageId: stage.id,
        submissionId: sent.submissionId,
        evidenceHash: submission.evidenceHash as `0x${string}`,
        stageIndex: stage.onChainIdx,
      });
      txHash = submitted.txHash;
    }
    const finalTx = (await db.select().from(chainTxs).where(eq(chainTxs.idempotencyKey, `submit_stage:${sent.submissionId}`)))[0];
    process.stdout.write(`stage ${stageNow?.status ?? "unknown"}\n`);
    process.stdout.write(`submitStage ${link(finalTx?.txHash ?? txHash)}\n`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "sepolia submit failed"}\n`);
  process.exit(1);
});
