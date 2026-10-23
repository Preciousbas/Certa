import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

describe("drain-verify", () => {
  it("does not import the chain package", () => {
    const source = readFileSync(path.join(root, "scripts/drain-verify.ts"), "utf8");
    expect(source.includes("@certa/chain")).toBe(false);
    expect(source.includes("server/chain")).toBe(false);
    expect(source.includes("submitStageTx")).toBe(false);
  });

  it("exits on an empty queue without loading the chain package or running migrations", async () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    delete env.SENTRY_DSN;
    delete env.CERTA_SKIP_MIGRATIONS;
    env.CERTA_MIGRATION_SENTRY = "1";
    env.VITEST = "1";
    env.PLAYWRIGHT = "";
    const started = Date.now();
    const child = spawn(
      "pnpm",
      ["exec", "tsx", "--import", "./scripts/drain-verify.guard.mjs", "scripts/drain-verify.ts"],
      { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const code = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("drain-verify did not exit within 20 seconds"));
      }, 20_000);
      child.on("exit", (status) => {
        clearTimeout(timer);
        resolve(status ?? 1);
      });
    });
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(stderr).not.toContain("imported the chain package");
    expect(stderr).not.toContain("migration runner called");
    expect(stdout).toContain("verify jobs 0");
    expect(code).toBe(0);
  });
});
