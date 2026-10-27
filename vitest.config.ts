import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: fileURLToPath(new URL("./packages/db/migrations", import.meta.url)),
  test: {
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "eslint-rules/**/*.test.ts", "packages/**/*.test.ts", "apps/**/*.test.ts", "tests/intake/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**", "apps/web/e2e/**"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    maxWorkers: 2,
  },
});
