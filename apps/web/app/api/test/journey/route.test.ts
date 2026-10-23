import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const saved = {
  PLAYWRIGHT: process.env.PLAYWRIGHT,
  DATABASE_URL: process.env.DATABASE_URL,
  VERCEL_ENV: process.env.VERCEL_ENV,
};

function restore() {
  if (saved.PLAYWRIGHT === undefined) delete process.env.PLAYWRIGHT;
  else process.env.PLAYWRIGHT = saved.PLAYWRIGHT;
  if (saved.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = saved.DATABASE_URL;
  if (saved.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = saved.VERCEL_ENV;
}

function post() {
  return POST(
    new Request("http://127.0.0.1/api/test/journey", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    }),
  );
}

describe("journey route", () => {
  afterEach(restore);

  it("returns 404 when DATABASE_URL is set even with PLAYWRIGHT=1", async () => {
    process.env.PLAYWRIGHT = "1";
    process.env.DATABASE_URL = "postgres://example.invalid/not-used";
    delete process.env.VERCEL_ENV;
    expect((await post()).status).toBe(404);
  });

  it("returns 404 when VERCEL_ENV is production", async () => {
    process.env.PLAYWRIGHT = "1";
    delete process.env.DATABASE_URL;
    process.env.VERCEL_ENV = "production";
    expect((await post()).status).toBe(404);
  });

  it("returns 404 when VERCEL_ENV is preview", async () => {
    process.env.PLAYWRIGHT = "1";
    delete process.env.DATABASE_URL;
    process.env.VERCEL_ENV = "preview";
    expect((await post()).status).toBe(404);
  });
});
