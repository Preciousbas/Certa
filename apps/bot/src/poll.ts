import { getDatabase } from "@certa/db";
import { createBot } from "./bot.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.log("TELEGRAM_BOT_TOKEN is not set. The Mini App can still run on port 3000.");
  await new Promise(() => undefined);
} else {
  const db = await getDatabase();
  const bot = createBot(token, {
    db,
    paidWeather: async () => "Agent paid $0.01 for the weather check.",
  });
  await bot.start();
}
