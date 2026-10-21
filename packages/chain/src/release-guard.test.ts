import { describe, expect, it } from "vitest";
import { BaseError } from "viem";
import { assertReleaseStageSendable, CAP_EXCEEDED_MESSAGE, certaEscrowFullAbi, encodeCall, erc20Abi, plainRevert, type Hex } from "./calls.js";

const escrow = "0x2222222222222222222222222222222222222222" as Hex;

describe("release cap guard", () => {
  it("does not call send when a releaseStage amount is above the cap", async () => {
    const data = encodeCall(certaEscrowFullAbi, "releaseStage", [1n]);
    let reads = 0;
    await expect(
      assertReleaseStageSendable(escrow, data, async () => {
        reads += 1;
        return { amount: 6_000_000n, spendingCap: 5_000_000n, clientApproved: false };
      }),
    ).rejects.toThrow(CAP_EXCEEDED_MESSAGE);
    expect(reads).toBe(1);
  });

  it("allows a release at or under the cap, and an over-cap release the client already approved", async () => {
    const data = encodeCall(certaEscrowFullAbi, "releaseStage", [0n]);
    await expect(
      assertReleaseStageSendable(escrow, data, async () => ({ amount: 1_000_000n, spendingCap: 5_000_000n, clientApproved: false })),
    ).resolves.toBeUndefined();
    await expect(
      assertReleaseStageSendable(escrow, data, async () => ({ amount: 6_000_000n, spendingCap: 5_000_000n, clientApproved: true })),
    ).resolves.toBeUndefined();
  });

  it("ignores calls that are not releaseStage", async () => {
    const data = encodeCall(erc20Abi, "approve", [escrow, 1n]);
    let reads = 0;
    await assertReleaseStageSendable(escrow, data, async () => {
      reads += 1;
      return { amount: 6_000_000n, spendingCap: 5_000_000n, clientApproved: false };
    });
    expect(reads).toBe(0);
  });
});

class CapRevert extends BaseError {
  data = "0xa4875a49";

  constructor() {
    super("execution reverted");
  }
}

describe("cap revert text", () => {
  it("reads CapExceeded from the raw revert data on an eth_call", () => {
    expect(plainRevert(new CapRevert()).plain).toBe(CAP_EXCEEDED_MESSAGE);
  });
});
