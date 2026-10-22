import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootEnv = path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env");
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

const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const app = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
const info = process.argv.includes("--info");

async function main() {
  if (info) {
    if (!token) {
      process.stderr.write("TELEGRAM_BOT_TOKEN is required\n");
      process.exit(1);
    }
    const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const body = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: { url?: string; pending_update_count?: number; last_error_message?: string; has_custom_certificate?: boolean };
    };
    if (!body.ok) {
      process.stderr.write(`webhook info failed ${body.description ?? ""}\n`);
      process.exit(1);
    }
    const result = body.result ?? {};
    process.stdout.write(
      `webhook url=${result.url ?? ""} pending=${result.pending_update_count ?? 0} last_error=${result.last_error_message ?? ""} custom_certificate=${result.has_custom_certificate ? "yes" : "no"}\n`,
    );
    return;
  }

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
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? `${error.message}\n` : "webhook failed\n");
  process.exit(1);
});
