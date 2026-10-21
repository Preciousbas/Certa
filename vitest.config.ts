import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "eslint-rules/**/*.test.ts", "packages/**/*.test.ts", "apps/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**", "apps/web/e2e/**"],
    testTimeout: 30_000,
  },
});
