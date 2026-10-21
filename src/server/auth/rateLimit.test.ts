import { afterEach, describe, expect, it } from "vitest";
import { limitLogin, rateLimitedResponse, resetLimits } from "./rateLimit.js";

describe("rate limit", () => {
  afterEach(() => {
    resetLimits();
    delete process.env.RATE_LIMIT_LOGIN_PER_MIN;
  });

  it("returns 429 with the exact message", async () => {
    process.env.RATE_LIMIT_LOGIN_PER_MIN = "2";
    expect(await limitLogin("203.0.113.8")).toBe(true);
    expect(await limitLogin("203.0.113.8")).toBe(true);
    expect(await limitLogin("203.0.113.8")).toBe(false);
    const response = rateLimitedResponse();
    expect(response.status).toBe(429);
    const body = (await response.json()) as { error: string; message: string; requestId: string };
    expect(body.error).toBe("rate_limited");
    expect(body.message).toBe("Too many requests. Please wait a minute and try again.");
    expect(body.requestId.length).toBeGreaterThan(8);
  });
});
