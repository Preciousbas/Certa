import { describe, expect, it } from "vitest";
import { adminDenied } from "./admin-access";
import { AuthError, FORBIDDEN, NOT_SIGNED_IN } from "./errors";

describe("adminDenied", () => {
  it("returns 403 when the caller is signed out or is not an admin", () => {
    expect(adminDenied(NOT_SIGNED_IN).status).toBe(403);
    expect(adminDenied(FORBIDDEN).status).toBe(403);
    expect(adminDenied(new AuthError(404, "not_found", "That page is not on Certa.")).status).toBe(403);
  });
});
