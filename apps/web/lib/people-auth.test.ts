import { describe, expect, it } from "vitest";
import { peopleAuthState } from "./people-auth.js";

describe("people auth", () => {
  it("does not ask a signed-in Mini App to sign in", () => {
    expect(peopleAuthState({ telegramReady: false, status: null, hasInitData: true })).toBe("loading");
    expect(peopleAuthState({ telegramReady: true, status: 200, hasInitData: true })).toBe("ready");
    expect(peopleAuthState({ telegramReady: true, status: 401, hasInitData: true })).toBe("error");
    expect(peopleAuthState({ telegramReady: true, status: 403, hasInitData: true })).toBe("forbidden");
    expect(peopleAuthState({ telegramReady: true, status: 401, hasInitData: false })).toBe("sign-in");
  });
});
