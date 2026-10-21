import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = ["/", "/stages", "/capture", "/fund", "/changes", "/wallet", "/report", "/billing", "/cashout", "/admin"];
const enums = /\b(pending|submitted|released|funded|new_stage|consultant_review|main_contractor|subcontractor)\b/;

test.describe("mobile routes", () => {
  for (const route of routes) {
    test(`${route} fits and stays readable`, async ({ page }) => {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow).toBe(false);
      const text = await page.locator("body").innerText();
      expect(text).not.toMatch(enums);
      expect(text).not.toMatch(/\{"ok"/);
      expect(text).not.toContain("OffRampProvider");
      const accessibility = await new AxeBuilder({ page }).analyze();
      const serious = accessibility.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
      expect(serious.map((item) => `${item.id}: ${item.help}`)).toEqual([]);
    });
  }

  test("dark theme follows Telegram", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "one width is enough");
    await page.route("https://telegram.org/**", (route) => route.abort());
    await page.addInitScript(() => {
      const button = { show() {}, hide() {}, onClick() {}, offClick() {}, setText() {} };
      window.Telegram = {
        WebApp: {
          colorScheme: "dark",
          themeParams: {},
          ready() {},
          expand() {},
          onEvent() {},
          offEvent() {},
          BackButton: button,
          MainButton: button,
        },
      };
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("health reports the live Ethereum Sepolia RPC", async ({ request }, info) => {
    test.skip(info.project.name !== "mobile", "one width is enough");
    const response = await request.get("/api/health");
    const body = (await response.json()) as { checks?: { rpc?: string; usdc?: string; contract?: string; cdp?: string } };
    expect(response.ok()).toBe(true);
    expect(body.checks?.rpc).toBe("ok");
    expect(body.checks?.usdc).toBe("ok");
    expect(body.checks?.contract).toBe("unset");
    expect(body.checks?.cdp).toBe("unset");
  });

  test("the money toggle changes the amounts", async ({ page }) => {
    await page.goto("/");
    const amount = page.locator("[data-money]").first();
    const before = await amount.innerText();
    const toggle = page.getByRole("button", { name: "Show USDC" });
    await expect(toggle).toHaveAttribute("data-ready", "true");
    await toggle.click();
    await expect(amount).not.toHaveText(before);
    await expect(amount).toContainText("USDC");
  });
});
