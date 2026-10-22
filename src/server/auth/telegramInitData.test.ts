import { describe, expect, it } from "vitest";
import { InitDataError, signInitData, verifyInitData } from "./telegramInitData.js";

const token = "123456:fake-bot-token";

function sample(authDate: number, name = "Ada") {
  return signInitData(
    {
      auth_date: String(authDate),
      query_id: "q-1",
      user: JSON.stringify({ id: 42, first_name: name }),
    },
    token,
  );
}

describe("verifyInitData", () => {
  it("accepts a valid sample", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyInitData(sample(now), token).id).toBe(42);
  });

  it("rejects a tampered field", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => verifyInitData(sample(now).replace("Ada", "Eve"), token)).toThrow(InitDataError);
  });

  it("rejects the wrong bot token", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => verifyInitData(sample(now), "999:other-bot")).toThrow(InitDataError);
  });

  it("rejects auth_date two hours old", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => verifyInitData(sample(now - 2 * 60 * 60), token)).toThrow(InitDataError);
  });

  it("rejects a future auth_date", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => verifyInitData(sample(now + 120), token)).toThrow(InitDataError);
  });
});
