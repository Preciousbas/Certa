const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const app = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

if (!token || !secret || !app) {
  process.stderr.write("TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, and APP_URL are required\n");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${app}/api/telegram`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query", "my_chat_member"],
  }),
});
const body = (await response.json()) as { ok?: boolean; description?: string };
process.stdout.write(`${body.ok ? "webhook set" : "webhook failed"} ${body.description ?? ""}\n`);
if (!body.ok) process.exit(1);
