import { describe, expect, it } from "vitest";
import { assertServerEnv } from "./env.js";

describe("environment", () => {
  it("names a missing variable and does not print a value", () => {
    expect(() => assertServerEnv({ DATABASE_URL: "postgres://local/certa" })).toThrow(
      "Invalid environment: TELEGRAM_BOT_TOKEN is required",
    );
  });
});
