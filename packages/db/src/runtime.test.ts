import { describe, expect, it } from "vitest";
import { playwrightMemoryAllowed, runtimeMigrationsEnabled } from "./runtime.js";

describe("runtime migrations", () => {
  it("stays off unless CERTA_RUN_MIGRATIONS=1, and skip or a forced stop wins", () => {
    expect(runtimeMigrationsEnabled({}, false)).toBe(false);
    expect(runtimeMigrationsEnabled({ CERTA_RUN_MIGRATIONS: "1" }, false)).toBe(true);
    expect(runtimeMigrationsEnabled({ CERTA_RUN_MIGRATIONS: "1", CERTA_SKIP_MIGRATIONS: "1" }, false)).toBe(false);
    expect(runtimeMigrationsEnabled({ CERTA_RUN_MIGRATIONS: "1" }, true)).toBe(false);
    expect(runtimeMigrationsEnabled({ CERTA_RUN_MIGRATIONS: "true" }, false)).toBe(false);
  });

  it("allows the Playwright demo only with no database URL and off Vercel", () => {
    expect(playwrightMemoryAllowed({ PLAYWRIGHT: "1" })).toBe(true);
    expect(playwrightMemoryAllowed({ PLAYWRIGHT: "1", DATABASE_URL: "" })).toBe(true);
    expect(playwrightMemoryAllowed({ PLAYWRIGHT: "1", DATABASE_URL: "postgres://db/certa" })).toBe(false);
    expect(playwrightMemoryAllowed({ PLAYWRIGHT: "1", VERCEL_ENV: "production" })).toBe(false);
    expect(playwrightMemoryAllowed({ PLAYWRIGHT: "1", VERCEL_ENV: "preview" })).toBe(false);
    expect(playwrightMemoryAllowed({ PLAYWRIGHT: "1", VERCEL_ENV: "development" })).toBe(true);
  });
});
