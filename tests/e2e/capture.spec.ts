import { expect, test, type Page } from "@playwright/test";
import { signInitData } from "../../src/server/auth/telegramInitData";
import { distanceMeters } from "../../packages/shared/src/geo";
import { C5, C6, C8, outsideRadius, poorAccuracy } from "../../src/server/verify/messages";

const site = { lat: 6.4474, lng: 3.4723 };
const token = "123:playwright-demo";

function initData(): string {
  return signInitData(
    {
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 1003, first_name: "Kemfor" }),
    },
    token,
  );
}

async function openCapture(page: Page, geo: { lat: number; lng: number; accuracy: number }) {
  const signed = initData();
  const salt = Math.floor(Math.random() * 1_000_000) + 1;
  await page.route("https://telegram.org/**", (route) => route.abort());
  await page.addInitScript(
    ({ data, place, salt }) => {
      const button = { show() {}, hide() {}, onClick() {}, offClick() {}, setText() {} };
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
        },
      };
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      let frame = 0;
      const paint = () => {
        if (!ctx) return;
        frame += 1;
        for (let y = 0; y < 720; y += 12) {
          for (let x = 0; x < 1280; x += 12) {
            const on = ((x + y) / 12 + frame) % 2 === 0;
            ctx.fillStyle = on ? "#f4f1ea" : "#1e3a5f";
            ctx.fillRect(x, y, 12, 12);
          }
        }
      };
      paint();
      window.setInterval(paint, 40);
      const stream = canvas.captureStream(12);
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: async () => stream },
      });
      const original = HTMLCanvasElement.prototype.toBlob;
      let shot = 0;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        shot += 1;
        const frame = document.createElement("canvas");
        frame.width = 1280;
        frame.height = 720;
        const pixels = frame.getContext("2d");
        if (!pixels) {
          original.call(this, callback, type, quality);
          return;
        }
        const image = pixels.createImageData(1280, 720);
        for (let y = 0; y < 720; y += 1) {
          for (let x = 0; x < 1280; x += 1) {
            const i = (y * 1280 + x) * 4;
            const cell = 48 + (salt % 7) * 16;
            const on = (Math.floor((x + salt) / cell) + Math.floor(y / cell) + shot) % 2 === 0;
            image.data[i] = on ? 220 : 24;
            image.data[i + 1] = on ? 200 : 48;
            image.data[i + 2] = on ? 160 : 72;
            image.data[i + 3] = 255;
          }
        }
        pixels.putImageData(image, 0, 0);
        original.call(frame, callback, type ?? "image/jpeg", quality ?? 0.85);
      };
      const position = {
        coords: {
          latitude: place.lat,
          longitude: place.lng,
          accuracy: place.accuracy,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: { getCurrentPosition: (ok: (value: typeof position) => void) => ok(position) },
      });
    },
    { data: signed, place: geo, salt },
  );
  await page.goto("/mini/capture");
  await expect(page.getByTestId("capture-message")).not.toHaveText("Opening the camera.", { timeout: 20_000 });
}

test("the capture page has no gallery picker", async ({ page }) => {
  await openCapture(page, { ...site, accuracy: 8 });
  await expect(page.locator("input[type=file]")).toHaveCount(0);
});

test("an off-site photo is refused with C-3", async ({ page }) => {
  const place = { lat: 9.06, lng: 7.49, accuracy: 8 };
  await openCapture(page, place);
  await page.getByRole("button", { name: "Take photo" }).click();
  const distance = Math.round(distanceMeters(place, site));
  await expect(page.getByTestId("capture-message")).toHaveText(outsideRadius(distance, 150));
});

test("a weak location fix is refused with C-4", async ({ page }) => {
  await openCapture(page, { ...site, accuracy: 80 });
  await page.getByRole("button", { name: "Take photo" }).click();
  await expect(page.getByTestId("capture-message")).toHaveText(poorAccuracy(80));
});

test("a photo older than 10 minutes is refused with C-5", async ({ page }) => {
  await page.clock.install({ time: new Date(Date.now() - 15 * 60 * 1000) });
  await openCapture(page, { ...site, accuracy: 8 });
  await page.getByRole("button", { name: "Take photo" }).click();
  await expect(page.getByTestId("capture-message")).toHaveText(C5);
});

test("a repeated photo is refused with C-6", async ({ page }) => {
  await openCapture(page, { ...site, accuracy: 8 });
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    let saved: Blob | null = null;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      original.call(this, (blob) => {
        saved = saved ?? blob;
        callback(saved);
      }, type, quality);
    };
  });
  await page.getByRole("button", { name: "Take photo" }).click();
  await expect(page.getByTestId("capture-message")).toHaveText("Photo kept.");
  await page.getByRole("button", { name: "Take photo" }).click();
  await expect(page.getByTestId("capture-message")).toHaveText(C6);
});

test("an offline photo waits on the phone and uploads when the connection returns", async ({ page, context }) => {
  await openCapture(page, { ...site, accuracy: 8 });
  await context.setOffline(true);
  await page.getByRole("button", { name: "Take photo" }).click();
  await expect(page.getByTestId("capture-message")).toHaveText(C8);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByTestId("capture-message")).toHaveText("Photo kept.", { timeout: 20_000 });
});
