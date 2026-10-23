import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { figuresReady, planShared, SCAN_V13 } from "../../../src/server/intake/messages.ts";

const out = join(process.cwd(), "../../docs/evidence/30");

const issues = {
  empty: false,
  contractSumLabel: "₦55,255,000.00",
  stageTotalLabel: "₦54,985,000.00",
  match: false,
  issues: [
    {
      code: "V01",
      field: "Bill 3, item 3.4",
      value: "25 m × ₦12,000.00 = ₦300,000.00, but the document says ₦30,000.00.",
      severity: "blocking",
      anchor: "p3:t1:r14",
      quote: "Bill 3, item 3.4, 25 m at ₦12,000.00, written as ₦30,000.00",
      kept: false,
      stageIndex: 3,
    },
    {
      code: "V14",
      field: "VAT",
      value: "VAT has no source quote or page, so it cannot be checked against the document.",
      severity: "blocking",
      anchor: null,
      quote: null,
      kept: false,
      stageIndex: null,
    },
  ],
};

test.beforeAll(() => {
  mkdirSync(out, { recursive: true });
});

test("review issues, correct, and keep", async ({ page }) => {
  await page.route("**/api/projects/**/contract", async (route) => {
    const body = route.request().postDataJSON() as { action?: string } | null;
    if (route.request().method() === "GET") {
      await route.fulfill({ json: issues });
      return;
    }
    if (body?.action === "correct") {
      await route.fulfill({
        json: {
          ...issues,
          stageTotalLabel: "₦55,255,000.00",
          match: true,
          issues: [{ ...issues.issues[0], value: "₦300,000.00" }, issues.issues[1]],
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        ...issues,
        stageTotalLabel: "₦55,255,000.00",
        match: true,
        issues: [{ ...issues.issues[0], value: "₦300,000.00" }, { ...issues.issues[1], kept: true, value: "Kept: VAT has no source quote or page, so it cannot be checked against the document." }],
      },
    });
  });
  await page.goto("/app/p/sample/contract/review");
  await expect(page.getByText("The stage total does not match the contract sum.")).toBeVisible();
  await page.getByRole("button", { name: /p3:t1:r14/ }).click();
  await expect(page.getByText("written as ₦30,000.00")).toBeVisible();
  await page.screenshot({ path: join(out, "review-issues.png"), fullPage: true });
  await page.getByRole("button", { name: "Correct", exact: true }).first().click();
  await page.getByLabel("Correct Bill 3, item 3.4").fill("300000.00");
  await page.locator("form").getByRole("button", { name: "Correct", exact: true }).click();
  await expect(page.getByText("The stage total matches the contract sum.")).toBeVisible();
  await page.getByRole("button", { name: "Keep", exact: true }).last().click();
  await expect(page.getByText("Kept.", { exact: true })).toBeVisible();
  await page.screenshot({ path: join(out, "correct-keep.png"), fullPage: true });
});

test("scan message", async ({ page }) => {
  await page.route("**/api/projects/**/contract", async (route) => {
    await route.fulfill({
      json: {
        empty: false,
        contractSumLabel: "Not found",
        stageTotalLabel: "₦0.00",
        match: false,
        issues: [{ code: "V13", field: "Document", value: SCAN_V13, severity: "warning", anchor: null, quote: SCAN_V13, kept: false, stageIndex: null }],
      },
    });
  });
  await page.goto("/app/p/sample/contract/review");
  await expect(page.getByText(SCAN_V13)).toBeVisible();
  await page.screenshot({ path: join(out, "v13-scan.png"), fullPage: true });
});

test("large upload succeeds", async ({ page }) => {
  const file = "/tmp/certa-large-schedule.csv";
  writeFileSync(file, `Item,Amount\n1,1000.00\n${"x".repeat(8 * 1024 * 1024)}`);
  await page.route("**/documents/upload-url", async (route) => {
    await route.fulfill({ json: { uploadUrl: "http://127.0.0.1:3100/storage-upload", token: "upload-token", path: "ws/large-schedule.csv", documentId: "doc-large" } });
  });
  await page.route("**/storage-upload", async (route) => {
    await route.fulfill({ status: 200, body: "" });
  });
  await page.route("**/documents/doc-large/complete", async (route) => {
    await route.fulfill({ json: { ok: true, documentId: "doc-large" } });
  });
  await page.goto("/app/p/sample/documents");
  await page.locator("input[type=file]").setInputFiles(file);
  await expect(page.getByText("Read", { exact: true })).toBeVisible();
  await expect(page.getByText("Reading", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: join(out, "large-upload.png"), fullPage: true });
});

test("telegram messages", async ({ page }) => {
  const read = figuresReady({
    project: "Sample duplex",
    sum: "₦55,255,000.00",
    vatPct: "7.5",
    stages: 9,
    retentionPct: "5",
    months: 6,
    warnings: 2,
    link: "http://127.0.0.1:3100/app/p/sample/contract/review",
  });
  const accept = planShared({
    clientName: "Ada Client",
    project: "Sample duplex",
    sum: "₦55,255,000.00",
    stageLines: "1. Substructure\n2. Roof",
    retentionPct: "5",
    months: 6,
    link: "https://t.me/certa_bot/app?startapp=contract_sample",
  });
  await page.setContent(`<!doctype html><html><body><main><p>Telegram</p><h1>Contract read</h1><pre>${read}</pre><h1>Please review</h1><pre>${accept}</pre></main></body></html>`);
  await expect(page.getByText("Figures ready for Sample duplex:")).toBeVisible();
  await page.locator("pre").nth(0).screenshot({ path: join(out, "telegram-bex.png") });
  await page.locator("pre").nth(1).screenshot({ path: join(out, "telegram-bac.png") });
});
