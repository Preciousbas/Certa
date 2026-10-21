import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
while (args[0] === "--") args.shift();
const result = spawnSync("pnpm", ["exec", "vitest", "run", ...args], { stdio: "inherit" });
process.exit(result.status ?? 1);
