import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "pnpm exec next dev --port 3100",
    url: "http://127.0.0.1:3100",
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      PLAYWRIGHT: "1",
      DATABASE_URL: "",
      CERTA_SKIP_MIGRATIONS: "1",
      DEPLOYER_PRIVATE_KEY: "",
      DEMO_SEED: "true",
      DEMO_MODE: "1",
      TELEGRAM_BOT_TOKEN: "123:playwright-demo",
      SESSION_SECRET: "playwright-session-secret-32chars",
      APP_ENCRYPTION_KEY: "playwright-demo-encryption-key-32b",
    },
  },
});
