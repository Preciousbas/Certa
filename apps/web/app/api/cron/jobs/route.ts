import { createBot } from "@certa/bot";
import { getDatabase } from "@certa/db";
import { webhookCallback } from "grammy";
import { tokensMatch } from "../../../../../../src/server/auth/http";
import { setTelegramUpdateDispatch } from "../../../../../../src/server/jobs/telegramUpdate";
import { drainJobs } from "../../../../../../src/server/jobs/worker";
import { fetchCbnRate } from "../../../../lib/cbn-rate";
import { apiError, emptyQuery, queryOf } from "../../../../lib/schemas";

setTelegramUpdateDispatch(async (update) => {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!token) throw new Error("Telegram bot token is not configured.");
  const db = await getDatabase();
  const bot = createBot(token, { db, officialRate: fetchCbnRate });
  const replay = new Request("http://localhost/api/telegram", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });
  await webhookCallback(bot, "std/http")(replay);
});

export const dynamic = "force-dynamic";

function requireCronSecret(request: Request): Response | null {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return apiError(503, "The job runner is not configured.", "unconfigured");
  const header = request.headers.get("x-cron-secret") ?? "";
  const bearer = request.headers.get("authorization") ?? "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice("Bearer ".length) : "";
  const headerOk = header.length > 0 && tokensMatch(header, secret);
  const bearerOk = token.length > 0 && tokensMatch(token, secret);
  if (!headerOk && !bearerOk) return apiError(401, "That request is not allowed.", "unauthorized");
  return null;
}

export async function GET(request: Request) {
  const query = emptyQuery.safeParse(queryOf(request));
  if (!query.success) return apiError(400, "That request is not valid.");
  const denied = requireCronSecret(request);
  if (denied) return denied;
  const result = await drainJobs(20);
  return Response.json({ ok: true, ...result });
}
