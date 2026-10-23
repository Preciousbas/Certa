import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

const BOT = "123:playwright-demo";

function signInitData(telegramId: number): string {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: telegramId, first_name: "Client" }),
  };
  const params = new URLSearchParams(fields);
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT).digest();
  const hash = createHmac("sha256", secret).update(dataCheck).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

test("fund flow reaches the confirm screen", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "one width is enough");
  const initData = signInitData(1001);
  await page.route("https://telegram.org/**", (route) => route.abort());
  await page.addInitScript((data) => {
    const button = { show() {}, hide() {}, onClick() {}, offClick() {}, setText() {}, setParams() {} };
    window.Telegram = {
      WebApp: {
        initData: data,
        colorScheme: "light",
        themeParams: {},
        ready() {},
        expand() {},
        onEvent() {},
        offEvent() {},
        BackButton: button,
        MainButton: button,
        HapticFeedback: { notificationOccurred() {} },
      },
    };
  }, initData);
  await page.route("**/api/mini/fund", async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        created: true,
        paymentId: "00000000-0000-4000-8000-000000000001",
        status: "pending",
        rail: "usdc",
        amountUsdc: "1000000",
        amountNgnKobo: "150000000",
        txHash: null,
        escrowAddress: null,
        contractorNotified: false,
        stages: [{ name: "Site clearing", amountNgnKobo: "150000000", amountUsdc: "1000000" }],
      },
    });
  });
  await page.goto("/fund");
  await page.getByRole("button", { name: "USDC", exact: true }).click();
  await page.getByRole("button", { name: /Lock .+ in escrow/ }).click();
  await page.getByRole("button", { name: "Lock money" }).click();
  await expect(page.getByText("Waiting on chain.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Escrow is not on chain yet.")).toBeVisible();
  await expect(page.getByText("Contractor not notified yet.")).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\b(pending|submitted|funded)\b/);
});
