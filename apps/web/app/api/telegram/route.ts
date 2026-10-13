import { getDatabase } from "@certa/db";
import { createBot } from "@certa/bot";
import { webhookCallback } from "grammy";

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) return Response.json({ error: "Bot webhook is not configured." }, { status: 503 });
  const header = request.headers.get("x-telegram-bot-api-secret-token");
  if (header !== secret) return new Response("unauthorized", { status: 401 });
  const db = await getDatabase();
  const bot = createBot(token, { db, paidWeather: async () => "Agent paid $0.01 for the weather check." });
  const handle = webhookCallback(bot, "std/http");
  return handle(request);
}
