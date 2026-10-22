import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findSecrets } from "../../../scripts/scan-client-secrets.mjs";

describe("client bundle secret scan", () => {
  it("fails when a secret name is in a static file", () => {
    const dir = mkdtempSync(join(tmpdir(), "certa-scan-"));
    writeFileSync(join(dir, "chunk.js"), "const token = process.env.TELEGRAM_BOT_TOKEN;");
    expect(findSecrets(dir).join("\n")).toContain("TELEGRAM_BOT_TOKEN");
  });

  it("passes a file that does not name a secret", () => {
    const dir = mkdtempSync(join(tmpdir(), "certa-scan-"));
    writeFileSync(join(dir, "chunk.js"), "const title = 'Certa';");
    expect(findSecrets(dir)).toEqual([]);
  });
});
