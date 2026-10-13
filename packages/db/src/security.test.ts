import { describe, expect, it } from "vitest";
import { chainHash, decryptString, encryptString } from "./crypto.js";
import { signDownload, verifyDownload } from "./files.js";
import { signInitData, verifyInitData } from "./telegramAuth.js";

describe("secrets and links", () => {
  it("round-trips encrypted email", () => {
    process.env.APP_ENCRYPTION_KEY = "test-key-at-least-16";
    const cipher = encryptString("ada@example.com");
    expect(cipher).not.toContain("ada@");
    expect(decryptString(cipher)).toBe("ada@example.com");
  });

  it("binds a signed URL to one user and ten minutes", () => {
    const now = 1_700_000_000;
    const url = signDownload({ key: "photos/a.jpg", userId: "user-a", ttlSeconds: 9999, secret: "s", now });
    const params = new URLSearchParams(url.split("?")[1]);
    expect(Number(params.get("exp")) - now).toBe(600);
    expect(verifyDownload(params.toString(), "s", now)?.userId).toBe("user-a");
    expect(verifyDownload(params.toString().replace("user-a", "user-b"), "s", now)).toBeNull();
    expect(verifyDownload(params.toString(), "s", now + 601)).toBeNull();
  });

  it("rejects a stale or tampered Mini App initData", () => {
    const now = 1_800_000_000;
    const init = signInitData(
      { auth_date: String(now), query_id: "q", user: JSON.stringify({ id: 42, first_name: "Ada" }) },
      "bot-token",
    );
    expect(verifyInitData(init, "bot-token", now)?.id).toBe(42);
    expect(verifyInitData(init, "bot-token", now + 86_401)).toBeNull();
    expect(verifyInitData(init.replace("Ada", "Eve"), "bot-token", now)).toBeNull();
  });

  it("hash-chains audit rows", () => {
    const first = chainHash("genesis", "created project");
    const second = chainHash(first, "accepted terms");
    expect(second).not.toBe(first);
    expect(chainHash(first, "accepted terms")).toBe(second);
  });
});
