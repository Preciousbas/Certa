import { describe, expect, it } from "vitest";
import { createPartyWallet, encodeRelease, evidenceHash, mockAddress } from "./wallet.js";

describe("chain helpers", () => {
  it("creates the same mock payment account for the same party", async () => {
    delete process.env.CDP_API_KEY_ID;
    const first = await createPartyWallet("party-1");
    const second = await createPartyWallet("party-1");
    expect(first.mock).toBe(true);
    expect(first.address).toBe(second.address);
    expect(first.address).toBe(mockAddress("party-1"));
    expect(mockAddress("party-2")).not.toBe(first.address);
  });

  it("hashes evidence and encodes a release call", () => {
    const hash = evidenceHash("{\"stage\":4}");
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(evidenceHash("{\"stage\":4}")).toBe(hash);
    expect(encodeRelease(4).startsWith("0x")).toBe(true);
  });
});
