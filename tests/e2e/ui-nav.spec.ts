import { expect, test } from "@playwright/test";

const widths = [320, 390, 430];

test.describe("bottom nav", () => {
  for (const width of widths) {
    test(`five equal items at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/stages");
      const items = page.locator("nav[aria-label='Primary'] > a, nav[aria-label='Primary'] > button");
      await expect(items).toHaveCount(5);
      const boxes = await items.evaluateAll((nodes) => nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        const label = node.querySelector(".nav-label")?.getBoundingClientRect();
        return { width: rect.width, bottom: label?.bottom ?? rect.bottom };
      }));
      const first = boxes[0];
      expect(first).toBeTruthy();
      for (const box of boxes) {
        expect(Math.abs(box.width - (first?.width ?? 0))).toBeLessThanOrEqual(1);
        expect(Math.abs(box.bottom - (first?.bottom ?? 0))).toBeLessThanOrEqual(1);
      }
      const timeline = await items.nth(0).innerText();
      expect(timeline).toContain("Timeline");
    });
  }

  test("the More sheet closes after navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/stages");
    const more = page.getByRole("button", { name: "More" });
    await more.click();
    await page.getByRole("link", { name: "Wallet" }).click();
    await expect(page).toHaveURL(/wallet/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
