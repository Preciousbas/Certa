import { readFileSync } from "node:fs";
import path from "node:path";
import { getDatabase } from "@certa/db";
import { fetchCbnRate } from "@certa/shared";
import { createBot } from "./bot.js";

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

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.log("TELEGRAM_BOT_TOKEN is not set. The Mini App can still run on port 3000.");
  await new Promise(() => undefined);
} else {
  const db = await getDatabase();
  const bot = createBot(token, { db, officialRate: fetchCbnRate });
  await bot.start();
}
