import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "eslint-rules/**/*.test.ts", "packages/**/*.test.ts", "apps/**/*.test.ts", "tests/intake/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**", "apps/web/e2e/**"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    maxWorkers: 2,
  },
});
