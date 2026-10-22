import { createBot } from "@certa/bot";
import { getDatabase } from "@certa/db";
import { webhookCallback } from "grammy";
import { acceptTelegramUpdate, requireWebhookSecret } from "../../../../../src/server/auth/webhook";
import { fetchCbnRate } from "../../../lib/cbn-rate";

export async function POST(request: Request) {
  const denied = requireWebhookSecret(request);
  if (denied) return denied;
  const db = await getDatabase();
  return acceptTelegramUpdate(request, {
    db,
    dispatch: async (update) => {
      const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
      const bot = createBot(token, { db, officialRate: fetchCbnRate });
      const replay = new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(update),
      });
      const handle = webhookCallback(bot, "std/http");
      await handle(replay);
    },
  });
}
