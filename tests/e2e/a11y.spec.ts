import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = ["/", "/login", "/app", "/stages", "/fund", "/changes", "/wallet", "/report", "/billing", "/settings", "/certificate"];

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const) {
  test.describe(`${viewport.width}px`, () => {
    for (const route of routes) {
      test(`${route} has no serious axe violations`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(route);
        const result = await new AxeBuilder({ page }).analyze();
        const serious = result.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
        expect(serious.map((item) => `${item.id}: ${item.help}`)).toEqual([]);
      });
    }
  });
}
