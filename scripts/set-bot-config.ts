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
  // The repo .env is optional for a dry run.
}

const app = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

const shared = [
  { command: "start", description: "Welcome or join with a code" },
  { command: "menu", description: "Options for this project" },
  { command: "projects", description: "Switch project" },
  { command: "help", description: "What this bot can do" },
  { command: "cancel", description: "Cancel the current step" },
  { command: "done", description: "Finish the current batch" },
];

const roleLists = {
  client: [...shared, { command: "upload", description: "Upload a contract or BoQ" }, { command: "review", description: "Items waiting for you" }, { command: "fund", description: "Lock money for this project" }, { command: "site", description: "Set the site pin" }, { command: "accept", description: "Accept the plan" }, { command: "stages", description: "See the stages" }],
  contractor: [...shared, { command: "photos", description: "Send stage photos" }, { command: "wallet", description: "Payments you have received" }, { command: "site", description: "Set the site pin" }, { command: "accept", description: "Accept the plan" }, { command: "stages", description: "See the stages" }],
  subcontractor: [...shared, { command: "photos", description: "Send stage photos" }, { command: "wallet", description: "Payments you have received" }],
  consultant: [...shared, { command: "upload", description: "Upload a contract or BoQ" }, { command: "review", description: "Items waiting for you" }],
};

const byCommand = new Map<string, { command: string; description: string }>();
for (const list of Object.values(roleLists)) {
  for (const item of list) byCommand.set(item.command, item);
}
const commands = [...byCommand.values()];

const menuButton = { type: "web_app", text: "Open Certa", web_app: { url: `${app}/mini` } };

const plan = {
  note: "Telegram scopes are chat scopes, not Certa roles. The default scope lists every command. Handlers answer with B-GE-1 when the role does not match.",
  scopes: [{ scope: { type: "default" }, commands }, { scope: { type: "all_private_chats" }, commands }],
  roleLists,
  menuButton,
};

if (process.argv.includes("--dry-run")) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  process.exit(0);
}

const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
if (!token) {
  process.stderr.write("TELEGRAM_BOT_TOKEN is required\n");
  process.exit(1);
}

async function main() {
  for (const scope of plan.scopes) {
    const response = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commands: scope.commands, scope: scope.scope }),
    });
    const body = (await response.json()) as { ok?: boolean; description?: string };
    process.stdout.write(`setMyCommands ${scope.scope.type}: ${body.ok ? "ok" : "failed"} ${body.description ?? ""}\n`);
    if (!body.ok) process.exit(1);
  }

  const menu = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ menu_button: menuButton }),
  });
  const menuBody = (await menu.json()) as { ok?: boolean; description?: string };
  process.stdout.write(`setChatMenuButton: ${menuBody.ok ? "ok" : "failed"} ${menuBody.description ?? ""}\n`);
  if (!menuBody.ok) process.exit(1);
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? `${error.message}\n` : "bot config failed\n");
  process.exit(1);
});
