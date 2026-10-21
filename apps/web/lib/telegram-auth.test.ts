import { describe, expect, it } from "vitest";
import { signInitData, verifyInitData } from "./telegram-auth";

const token = "123456:test-bot";

function sample(now: number, name = "Ada") {
  return signInitData(
    { auth_date: String(now), query_id: "q", user: JSON.stringify({ id: 1004, first_name: name }) },
    token,
  );
}

describe("initData HMAC", () => {
  it("accepts a valid signature", () => {
    const now = 1_800_000_000;
    expect(verifyInitData(sample(now), token, now)?.id).toBe(1004);
  });

  it("rejects a tampered payload", () => {
    const now = 1_800_000_000;
    expect(verifyInitData(sample(now).replace("Ada", "Eve"), token, now)).toBeNull();
  });

  it("rejects initData older than 24 hours", () => {
    const now = 1_800_000_000;
    expect(verifyInitData(sample(now), token, now + 86_401)).toBeNull();
  });
});
