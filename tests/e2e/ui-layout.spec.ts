import { expect, test } from "@playwright/test";

const routes = ["/", "/login", "/app", "/stages", "/fund", "/changes", "/wallet", "/report", "/billing", "/settings", "/admin", "/certificate", "/terms", "/privacy"];

test.describe("content width", () => {
  test("every page uses the same content width", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const widths: number[] = [];
    for (const route of routes) {
      await page.goto(route);
      const box = await page.locator("[data-page-container]").first().boundingBox();
      expect(box, route).toBeTruthy();
      widths.push(Math.round(box?.width ?? 0));
    }
    expect(Math.max(...widths)).toBeLessThanOrEqual(1120);
    expect(new Set(widths).size).toBe(1);
  });
});

test("landing links to the Telegram bot", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Open in Telegram" })).toHaveAttribute("href", "https://t.me/CertaApp_bot");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pay for building work only when it's done.");
});

test("one orange action per view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of routes) {
    await page.goto(route);
    const count = await page.evaluate(() => {
      const primary = "rgb(194, 65, 12)";
      return [...document.querySelectorAll("body *")].filter((node) => getComputedStyle(node).backgroundColor === primary).length;
    });
    expect(count, route).toBeLessThanOrEqual(1);
  }
});

test("currency switch changes fund, stages and a stage page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/stages");
  const projectId = await page.locator("select[aria-label='Switch project']").inputValue();
  for (const route of ["/fund", "/stages", `/app/p/${projectId}/stages/1`]) {
    await page.goto(route);
    const amount = page.locator("[data-money]").first();
    const before = await amount.innerText();
    await page.getByRole("button", { name: "Show USDC" }).click();
    await expect(amount).not.toHaveText(before);
    await page.getByRole("button", { name: "Show naira" }).click();
  }
});
