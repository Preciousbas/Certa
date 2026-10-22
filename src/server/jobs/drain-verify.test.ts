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

  it("exits on an empty queue without loading the chain package", async () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    env.VITEST = "1";
    env.PLAYWRIGHT = "";
    const child = spawn(
      "pnpm",
      ["exec", "tsx", "--import", "./scripts/drain-verify.guard.mjs", "scripts/drain-verify.ts"],
      { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const code = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("drain-verify did not exit within 30 seconds"));
      }, 25_000);
      child.on("exit", (status) => {
        clearTimeout(timer);
        resolve(status ?? 1);
      });
    });
    expect(stderr).not.toContain("imported the chain package");
    expect(code).toBe(0);
  });
});
