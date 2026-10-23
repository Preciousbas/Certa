import { defineConfig } from "@playwright/test";

const demo = {
  PLAYWRIGHT: "1",
  DATABASE_URL: "",
  CERTA_SKIP_MIGRATIONS: "1",
  DEPLOYER_PRIVATE_KEY: "",
  DEMO_SEED: "true",
  DEMO_MODE: "1",
  TELEGRAM_BOT_TOKEN: "123:playwright-demo",
  APP_URL: "http://127.0.0.1:3102",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3102",
  SESSION_SECRET: "playwright-session-secret-32chars",
  APP_ENCRYPTION_KEY: "playwright-demo-encryption-key-32b",
  SENTRY_DSN: "",
};

export default defineConfig({
  testDir: "./journeys",
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "../../playwright-report/journeys" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3102",
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "pnpm --filter @certa/web exec next dev --port 3102",
    url: "http://127.0.0.1:3102",
    timeout: 120_000,
    reuseExistingServer: false,
    env: { ...process.env, ...demo },
  },
});
