import { describe, expect, it } from "vitest";
import { LoginDataError, signLoginWidget, verifyLoginWidget } from "./telegramLogin.js";

const token = "123456:fake-bot-token";

function fields(authDate: number, name = "Ada") {
  return signLoginWidget(
    {
      id: "77",
      first_name: name,
      username: "ada",
      auth_date: String(authDate),
    },
    token,
  );
}

describe("verifyLoginWidget", () => {
  it("accepts a valid sample", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyLoginWidget(fields(now), token, now).id).toBe(77);
  });

  it("rejects a tampered field", () => {
    const now = Math.floor(Date.now() / 1000);
    const signed = fields(now);
    signed.first_name = "Eve";
    expect(() => verifyLoginWidget(signed, token, now)).toThrow(LoginDataError);
  });

  it("rejects the wrong bot token", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => verifyLoginWidget(fields(now), "999:other-bot", now)).toThrow(LoginDataError);
  });

  it("rejects auth_date older than 24 hours", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => verifyLoginWidget(fields(now - 24 * 60 * 60 - 5), token, now)).toThrow(LoginDataError);
  });

  it("rejects a future auth_date", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => verifyLoginWidget(fields(now + 120), token, now)).toThrow(LoginDataError);
  });
});
