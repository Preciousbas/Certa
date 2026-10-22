import { readFileSync } from "node:fs";
import path from "node:path";
import { getDatabase } from "@certa/db";
import { fetchCbnRate } from "@certa/shared";
import { createBot } from "./bot.js";
import { drainJobs } from "../../../src/server/jobs/worker.js";
import { registerVerifyJobs } from "../../../src/server/verify/register.js";

async function runQueuedJobs() {
  registerVerifyJobs();
  for (;;) {
    try {
      await drainJobs(1);
    } catch (error) {
      console.error(JSON.stringify({ msg: "job worker", err: error instanceof Error ? error.message : "failed" }));
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

const rootEnv = path.join(import.meta.dirname, "../../../.env");
try {
  for (const line of readFileSync(rootEnv, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    if (!process.env[key]) process.env[key] = line.slice(index + 1);
  }
} catch {
  // The repo .env is optional.
}

const LIVE_WEBHOOK = "https://certa-two.vercel.app/api/telegram";

async function restoreLiveWebhook(): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!botToken || !secret) {
    console.error("Live webhook was not restored.");
    return false;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: LIVE_WEBHOOK,
        secret_token: secret,
        allowed_updates: ["message", "callback_query", "my_chat_member"],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json()) as { ok?: boolean };
    if (!body.ok) {
      console.error("Live webhook restore failed.");
      return false;
    }
    console.log("Live webhook restored.");
    return true;
  } catch {
    console.error("Live webhook restore failed.");
    return false;
  }
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const poll = process.argv.includes("--poll");
if (!poll) {
  console.log("Bot polling is off. Start it with pnpm dev:bot.");
  process.exit(0);
}
void runQueuedJobs();
if (!token) {
  console.log("TELEGRAM_BOT_TOKEN is not set. The Mini App can still run on port 3000.");
  await new Promise(() => undefined);
} else {
  const db = await getDatabase();
  const bot = createBot(token, { db, officialRate: fetchCbnRate });
  const stop = () => {
    void bot.stop().catch(() => undefined);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await bot.start();
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    const restored = await restoreLiveWebhook();
    process.exit(restored ? 0 : 1);
  }
}
