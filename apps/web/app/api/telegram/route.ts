import { createBot } from "@certa/bot";
import { getDatabase } from "@certa/db";
import { webhookCallback } from "grammy";
import { after } from "next/server";
import { acceptTelegramUpdate, requireWebhookSecret } from "../../../../../src/server/auth/webhook";
import { drainAfterHandler } from "../../../../../src/server/intake/schedule";
import { fetchCbnRate } from "../../../lib/cbn-rate";

export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = requireWebhookSecret(request);
  if (denied) return denied;
  const db = await getDatabase();
  let handler: Promise<unknown> = Promise.resolve();
  let slow: Promise<void> = Promise.resolve();
  let armed = false;
  after(async () => {
    await drainAfterHandler(armed ? handler : Promise.resolve(), async () => {
      await slow;
      const { runDocumentJobs } = await import("../../../../../src/server/intake/run");
      await runDocumentJobs().catch((error: unknown) => {
        console.error(JSON.stringify({ msg: "document jobs", message: error instanceof Error ? error.message : "failed", stack: error instanceof Error ? error.stack?.split("\n").slice(0, 8).join("\n") : "" }));
      });
    });
  });
  return acceptTelegramUpdate(request, {
    db,
    onSlow: (done) => {
      slow = done;
    },
    dispatch: async (update) => {
      const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
      const bot = createBot(token, { db, officialRate: fetchCbnRate });
      const replay = new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(update),
      });
      const handle = webhookCallback(bot, "std/http");
      const work = handle(replay);
      handler = work;
      armed = true;
      await work;
    },
  });
}
