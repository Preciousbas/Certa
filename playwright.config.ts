import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  use: { baseURL: "http://127.0.0.1:3101" },
  webServer: {
    command: "pnpm exec next dev --port 3101",
    cwd: "apps/web",
    url: "http://127.0.0.1:3101",
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      DATABASE_URL: "",
      DEMO_SEED: "true",
      PLAYWRIGHT: "1",
      TELEGRAM_BOT_TOKEN: "123:playwright-demo",
      SESSION_SECRET: "playwright-session-secret-32chars",
      APP_ENCRYPTION_KEY: "playwright-demo-encryption-key-32b",
      LLM_API_KEY: "",
      AI_DOC_API_KEY: "",
      NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: "CertaApp_bot",
    },
  },
});
