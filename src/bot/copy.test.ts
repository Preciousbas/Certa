import { bFu4, bGe3, bIn11, bSt1 } from "./messages.js";
import { appBaseUrl } from "../lib/appUrl.js";
import { describe, expect, it } from "vitest";

describe("copy", () => {
  it("does not double the full stop on a failed lock", () => {
    const text = bFu4({ plainReason: "The wallet is empty.", supportEmail: "" });
    expect(text).not.toContain("..");
    expect(text).not.toContain("support@");
    expect(text.toLowerCase()).not.toContain("contact support");
  });

  it("never uses localhost as the app url in production", () => {
    const previous = process.env.CERTA_ENV;
    const app = process.env.APP_URL;
    const next = process.env.NEXT_PUBLIC_APP_URL;
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.CERTA_ENV = "production";
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(appBaseUrl()).not.toContain("localhost");
    process.env.CERTA_ENV = previous;
    if (app) process.env.APP_URL = app;
    if (next) process.env.NEXT_PUBLIC_APP_URL = next;
    if (vercel) process.env.VERCEL_PROJECT_PRODUCTION_URL = vercel;
  });

  it("keeps sample bot lines free of placeholders", () => {
    const samples = [bSt1(), bIn11({ project: "Plot" }), bGe3({ supportEmail: "" })];
    for (const line of samples) {
      expect(line).not.toContain("example.com");
      expect(line).not.toContain("localhost");
    }
  });
});
