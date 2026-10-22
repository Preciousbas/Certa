import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

function loadEnv(): void {
  const file = path.join(process.cwd(), ".env");
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index);
      if (!process.env[key]) process.env[key] = line.slice(index + 1);
    }
  } catch {
    // The environment may already be set.
  }
}

loadEnv();

async function main(): Promise<void> {
const projectFlag = process.argv.indexOf("--project");
const requestedId = projectFlag >= 0 ? process.argv[projectFlag + 1] : undefined;

const { chainTxs, getDatabase, notifications, memberships, projects, stages, workspaces, x402Spend } = await import("@certa/db");
const { getOrCreateWallet } = await import("../src/server/chain/wallets.js");
const { handlePaidWeather } = await import("../apps/web/lib/x402-server.js");
const { runPrePourCheck } = await import("../src/server/x402/prepour.js");
const { agentUsdcBalance } = await import("../src/server/x402/health.js");
const { BASE_SEPOLIA_CHAIN, WEATHER_PRICE_MICRO } = await import("../src/server/x402/gate.js");
const { registerNotifyJobs } = await import("../src/bot/notify.js");
const { drainJobs } = await import("../src/server/jobs/worker.js");

function listen(handler: (request: NextRequest) => Promise<Response>): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const host = `http://127.0.0.1:${(server.address() as { port: number }).port ?? 0}`;
    const request = new NextRequest(`${host}${req.url ?? "/"}`, { method: req.method });
    void handler(request)
      .then(async (response) => {
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      })
      .catch(() => {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "The weather route failed." }));
      });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

const db = await getDatabase();
const project = requestedId
  ? (await db.select().from(projects).where(eq(projects.id, requestedId)))[0]
  : (await db.select().from(projects).innerJoin(workspaces, eq(workspaces.id, projects.workspaceId)).where(eq(workspaces.isDemo, true)))[0]?.projects;
if (!project) {
  process.stdout.write("No project was found for the weather check.\n");
  process.exit(1);
}
const workspace = (await db.select().from(workspaces).where(eq(workspaces.id, project.workspaceId)))[0];
const stageRows = (await db.select().from(stages).where(eq(stages.projectId, project.id))).filter(
  (stage) => stage.pour || stage.tags.includes("concrete_pour") || stage.tags.includes("roofing"),
);
const stage = stageRows[0];
if (!workspace || !stage) {
  process.stdout.write("That project has no concrete pour stage.\n");
  process.exit(1);
}
if (workspace.allowanceMicro < WEATHER_PRICE_MICRO && workspace.isDemo) {
  await db.update(workspaces).set({ allowanceMicro: 2_000_000n, x402AllowanceUsdc: 2_000_000n }).where(eq(workspaces.id, workspace.id));
  process.stdout.write("Demo workspace allowance set to 2.00 USDC for this check.\n");
}

process.stdout.write("creating agent_x402 wallet\n");
const agent = await getOrCreateWallet(db, { purpose: "agent_x402", chainId: BASE_SEPOLIA_CHAIN });
process.stdout.write(`agent_x402 ${agent.address}\n`);
process.stdout.write("Fund Base Sepolia USDC at https://faucet.circle.com/ for that address.\n");
let balance = 0n;
try {
  balance = await agentUsdcBalance(agent.address);
} catch {
  process.stdout.write("Base Sepolia did not return the agent balance.\n");
  process.exit(1);
}
process.stdout.write(`balance_micro ${balance.toString()}\n`);
if (balance < WEATHER_PRICE_MICRO) {
  process.stdout.write("The agent wallet does not have enough Base Sepolia USDC to pay 0.01.\n");
  process.exit(1);
}

const gateway = await listen((request) => handlePaidWeather(request));
try {
  const result = await runPrePourCheck(db, { projectId: project.id, stageId: stage.id, origin: gateway.url });
  registerNotifyJobs();
  await drainJobs(10, { kind: "notify_telegram" });
  const people = await db.select().from(memberships).where(eq(memberships.projectId, project.id));
  const notes = await db.select().from(notifications);
  const sent = notes.filter((row) => people.some((person) => person.userId === row.userId) && String(row.kind).startsWith("B-WX"));
  for (const note of sent) {
    const text = note.payload["text"];
    if (typeof text === "string") process.stdout.write(`message ${text}\n`);
  }
  const spends = (await db.select().from(x402Spend).where(eq(x402Spend.stageId, stage.id))).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const latest = spends[0];
  const tx = latest?.chainTxId ? (await db.select().from(chainTxs).where(eq(chainTxs.id, latest.chainTxId)))[0] : undefined;
  if (latest) process.stdout.write(`summary ${latest.resultSummary}\n`);
  if (tx?.txHash) process.stdout.write(`proof https://sepolia.basescan.org/tx/${tx.txHash}\n`);
  process.stdout.write(`result ${result}\n`);
  if (result !== "sent" || !tx?.txHash) process.exit(1);
} finally {
  await gateway.close();
}
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "The weather check failed.";
  const stack = error instanceof Error ? error.stack ?? "" : "";
  const where = stack
    .split("\n")
    .filter((line) => line.includes("/certa/") && !line.includes("node_modules"))
    .slice(0, 6)
    .join("\n");
  process.stderr.write(`${message}\n${where}\n`);
  process.exit(1);
});
