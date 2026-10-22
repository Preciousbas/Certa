import { describe, expect, it } from "vitest";
import { runtimeMigrationsEnabled } from "./runtime.js";

describe("runtime migrations", () => {
  it("stays off unless CERTA_RUN_MIGRATIONS=1, and skip or a forced stop wins", () => {
    expect(runtimeMigrationsEnabled({}, false)).toBe(false);
    expect(runtimeMigrationsEnabled({ CERTA_RUN_MIGRATIONS: "1" }, false)).toBe(true);
    expect(runtimeMigrationsEnabled({ CERTA_RUN_MIGRATIONS: "1", CERTA_SKIP_MIGRATIONS: "1" }, false)).toBe(false);
    expect(runtimeMigrationsEnabled({ CERTA_RUN_MIGRATIONS: "1" }, true)).toBe(false);
    expect(runtimeMigrationsEnabled({ CERTA_RUN_MIGRATIONS: "true" }, false)).toBe(false);
  });
});
