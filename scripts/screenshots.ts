import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium } = require("@playwright/test") as typeof import("@playwright/test");

const outFlag = process.argv.indexOf("--out");
const outDir = outFlag === -1 ? "docs/evidence/80/after" : (process.argv[outFlag + 1] ?? "docs/evidence/80/after");
const base = process.env.SCREENSHOT_BASE ?? "http://127.0.0.1:3102";

const routes = [
  ["landing", "/"],
  ["login", "/login"],
  ["projects", "/app"],
  ["stages", "/stages"],
  ["fund", "/fund"],
  ["changes", "/changes"],
  ["timeline", "/timeline"],
  ["overview", "/app"],
  ["wallet", "/wallet"],
  ["reports", "/report"],
  ["billing", "/billing"],
  ["settings", "/settings"],
  ["terms", "/terms"],
  ["privacy", "/privacy"],
  ["admin", "/admin"],
  ["certificate", "/certificate"],
  ["capture", "/capture"],
  ["cashout", "/cashout"],
  ["upload", "/upload"],
  ["not-found", "/missing-page"],
];

const sizes = [
  ["1440x900", { width: 1440, height: 900 }],
  ["390x844", { width: 390, height: 844 }],
] as const;

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const [sizeName, viewport] of sizes) {
    const page = await browser.newPage({ viewport });
    for (const [name, route] of routes) {
      await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(400);
      const file = join(outDir, `${name}-${sizeName}.png`);
      await page.screenshot({ path: file, fullPage: true });
      process.stdout.write(`${file}\n`);
    }
    await page.close();
  }
  await browser.close();
}

void main();
