import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

const BOT = "123:playwright-demo";
const FIXTURE = path.resolve(__dirname, "../../fixtures/stage-photos/stage-1-01.jpg");
const TX = `0x${"ab".repeat(32)}`;

function signInitData(telegramId: number, name: string): string {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "journey",
    user: JSON.stringify({ id: telegramId, first_name: name, username: name.toLowerCase() }),
  };
  const dataCheck = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT).digest();
  const hash = createHmac("sha256", secret).update(dataCheck).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

async function signed(browser: Browser, telegramId: number, name: string) {
  const initData = signInitData(telegramId, name);
  const context = await browser.newContext();
  await context.route("https://telegram.org/**", (route) => route.abort());
  await context.addInitScript((value) => {
    const button = { show() {}, hide() {}, onClick() {}, offClick() {}, setText() {}, setParams() {} };
    const view = window as Window & {
      Telegram?: {
        WebApp?: {
          initData: string;
          ready: () => void;
          expand: () => void;
          onEvent: () => void;
          offEvent: () => void;
          BackButton: typeof button;
          MainButton: typeof button;
          HapticFeedback: { notificationOccurred: () => void };
        };
      };
    };
    view.Telegram = {
      WebApp: {
        initData: value,
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
  const page = await context.newPage();
  const hello = await page.request.get("/api/projects", { headers: { authorization: `tma ${initData}` } });
  expect(hello.ok()).toBeTruthy();
  return { context, page, initData };
}

async function projectIdFrom(page: Page, initData: string): Promise<string> {
  const listed = await page.request.get("/api/projects", { headers: { authorization: `tma ${initData}` } });
  const body = (await listed.json()) as { projects?: { projectId: string }[] };
  const id = body.projects?.[0]?.projectId;
  expect(id).toBeTruthy();
  return id ?? "";
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  const reset = await request.post("/api/test/journey", { data: { action: "reset" } });
  expect(reset.status()).toBe(204);
});

test("a resolved dispute shows 100% on changes", async ({ page }) => {
  await page.goto("/changes");
  await page.getByRole("button", { name: "Disputes" }).click();
  await expect(page.getByText("Released in full (100%)")).toBeVisible();
});

test("a non-member cannot download the report or the certificate", async ({ page, request }) => {
  await page.goto("/app");
  const href = await page.locator('a[href*="/app/p/"]').first().getAttribute("href");
  const projectId = href?.match(/\/app\/p\/([0-9a-f-]{36})/)?.[1];
  expect(projectId).toBeTruthy();
  const report = await request.get(`/api/projects/${projectId}/report`);
  const certificate = await request.get(`/api/projects/${projectId}/stages/1/certificate`);
  expect(report.status()).toBe(401);
  expect(certificate.status()).toBe(401);
  const stranger = signInitData(880099, "Stranger");
  const deniedReport = await request.get(`/api/projects/${projectId}/report`, {
    headers: { authorization: `tma ${stranger}` },
  });
  const deniedCertificate = await request.get(`/api/projects/${projectId}/stages/1/certificate`, {
    headers: { authorization: `tma ${stranger}` },
  });
  expect(deniedReport.status()).toBe(403);
  expect(deniedCertificate.status()).toBe(403);
});

test("builder, client, and consultant finish one stage", async ({ browser, request }) => {
  const builder = await signed(browser, 880001, "Kem");
  const client = await signed(browser, 880002, "Zee");
  const consultant = await signed(browser, 880003, "Okafor");
  try {
    await builder.page.goto("/app");
    await builder.page.getByRole("button", { name: "Start a project" }).click();
    await builder.page.getByLabel("Project name").fill("Journey duplex");
    await builder.page.getByRole("button", { name: "Contractor" }).click();
    await expect(builder.page.getByText("You don't have permission")).toHaveCount(0);
    const link = builder.page.locator('a[href*="t.me/"][href*="start="]');
    await expect(link).toBeVisible();
    const invite = await link.getAttribute("href");
    expect(invite).toContain("https://t.me/");
    const projectId = await projectIdFrom(builder.page, builder.initData);

    await client.page.goto("/app");
    await client.page.getByRole("button", { name: "I have an invite link" }).click();
    await client.page.getByLabel("Invite link").fill(invite ?? "");
    await client.page.getByRole("button", { name: "Join" }).click();
    await expect(client.page.getByText(/You've joined/)).toBeVisible();

    const staged = await request.post("/api/test/journey", { data: { action: "stage", projectId } });
    expect(staged.ok()).toBeTruthy();
    const stageBody = (await staged.json()) as { stageId: string };
    expect(stageBody.stageId).toBeTruthy();

    await client.page.route("**/api/mini/fund", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "confirmed",
          txHash: TX,
          escrowAddress: "0x5289dcc36EdC15AdC6314F75EcBFa745e70BD44d",
          contractorNotified: true,
          amountNgnKobo: "100000000",
          amountUsdc: "666666",
          stages: [{ name: "Ground slab", amountNgnKobo: "100000000", amountUsdc: "666666" }],
        }),
      });
    });
    await client.page.goto("/fund");
    await client.page.getByRole("button", { name: "USDC", exact: true }).click();
    await client.page.getByRole("button", { name: /Lock .+ in escrow/ }).click();
    await client.page.getByRole("button", { name: "Lock money" }).click();
    await expect(client.page.getByRole("heading", { name: "Locked." })).toBeVisible();
    await expect(client.page.getByRole("link", { name: "Proof on Etherscan" })).toBeVisible();

    const photo = readFileSync(FIXTURE);
    await builder.page.route("**/api/mini/capture", async (route) => {
      const raw = route.request().postDataBuffer();
      expect(raw?.includes(photo.subarray(0, 3))).toBe(true);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accepted: true, message: "Photo kept.", photoId: "fixture", trust: "high", reasons: ["Photo kept."] }),
      });
    });
    await builder.page.goto("/capture");
    const captured = await builder.page.evaluate(
      async ({ projectId: id, stageId, initData, bytes }) => {
        const body = new FormData();
        body.set("photo", new Blob([Uint8Array.from(bytes)], { type: "image/jpeg" }), "stage-1-01.jpg");
        body.set("projectId", id);
        body.set("stageId", stageId);
        body.set("nonce", "journey");
        body.set("capturedAt", String(Date.now()));
        body.set("lat", "6.4474");
        body.set("lng", "3.4723");
        body.set("accuracy", "5");
        const response = await fetch("/api/mini/capture", {
          method: "POST",
          headers: { authorization: `tma ${initData}` },
          body,
        });
        return response.status;
      },
      { projectId, stageId: stageBody.stageId, initData: builder.initData, bytes: Array.from(photo) },
    );
    expect(captured).toBe(200);

    const reviewed = await request.post("/api/test/journey", { data: { action: "review", projectId } });
    expect(reviewed.ok()).toBeTruthy();
    await consultant.page.route("**/api/mini/review", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ moneyMoved: false, message: "Recorded. The money stays locked." }),
      });
    });
    await consultant.page.goto("/stages");
    await consultant.page.getByRole("button", { name: "Approve" }).click();
    await expect(consultant.page.getByText("The money stays locked.")).toBeVisible();

    const released = await request.post("/api/test/journey", { data: { action: "release", projectId } });
    expect(released.ok()).toBeTruthy();
    await client.page.goto("/report");
    await expect(client.page.getByText(/paid out/)).toBeVisible();

    const report = await client.page.request.get(`/api/projects/${projectId}/report`, {
      headers: { authorization: `tma ${client.initData}` },
    });
    const certificate = await client.page.request.get(`/api/projects/${projectId}/stages/1/certificate`, {
      headers: { authorization: `tma ${client.initData}` },
    });
    expect(report.status()).toBe(200);
    expect(report.headers()["content-type"]).toContain("application/pdf");
    expect(certificate.status()).toBe(200);
    expect(certificate.headers()["content-type"]).toContain("application/pdf");
  } finally {
    await builder.context.close();
    await client.context.close();
    await consultant.context.close();
  }
});
