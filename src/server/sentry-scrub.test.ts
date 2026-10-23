import { describe, expect, it } from "vitest";
import { scrubEvent } from "./sentry-scrub";

describe("scrubEvent", () => {
  it("removes emails, private keys, tokens, and request bodies", () => {
    const privateKey = `0x${"ab".repeat(32)}`;
    const event = {
      message: "ada@example.com could not sign",
      user: { email: "ada@example.com" },
      request: {
        data: { note: "body stays here", email: "ada@example.com" },
        cookies: { certa_session: "session-token" },
        headers: { authorization: "tma secret", cookie: "a=b", accept: "application/json" },
        url: "https://certa.example/api/mini/fund?token=abc",
      },
      extra: { key: privateKey },
      breadcrumbs: [{ message: `wallet ${privateKey}` }],
    };
    const clean = scrubEvent(event);
    const encoded = JSON.stringify(clean);
    expect(clean.user).toBeUndefined();
    expect(clean.extra).toBeUndefined();
    expect(clean.request?.data).toBeUndefined();
    expect(clean.request?.cookies).toBeUndefined();
    expect(clean.request?.headers?.authorization).toBeUndefined();
    expect(clean.request?.headers?.cookie).toBeUndefined();
    expect(clean.request?.headers?.accept).toBe("application/json");
    expect(clean.request?.url).toBe("https://certa.example/api/mini/fund");
    expect(encoded).not.toContain("ada@example.com");
    expect(encoded).not.toContain(privateKey);
    expect(encoded).not.toContain("session-token");
    expect(encoded).not.toContain("body stays here");
  });
});
