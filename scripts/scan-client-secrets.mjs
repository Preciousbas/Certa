import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const SECRET_NAMES = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "CDP_API_KEY_ID",
  "CDP_API_KEY_SECRET",
  "CDP_WALLET_SECRET",
  "DEPLOYER_PRIVATE_KEY",
  "EVM_PRIVATE_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "AI_API_KEY",
  "LLM_API_KEY",
  "X402_FACILITATOR_URL",
  "X402_PAY_TO_ADDRESS",
  "RESEND_API_KEY",
  "DATABASE_URL",
  "APP_ENCRYPTION_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

export function findSecrets(root) {
  if (!existsSync(root)) return [`missing ${root}`];
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) {
        walk(file);
        continue;
      }
      if (!/\.(js|css|html|json|txt|map)$/.test(name)) continue;
      const text = readFileSync(file, "utf8");
      for (const secret of SECRET_NAMES) {
        if (text.includes(secret)) hits.push(`${file} contains ${secret}`);
      }
    }
  };
  walk(root);
  return hits;
}

const root = process.argv[2];
if (root) {
  const hits = findSecrets(root);
  if (hits.length > 0) {
    console.error(hits.join("\n"));
    process.exit(1);
  }
}
