import { encodeAbiParameters, encodeEventTopics, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { certaEscrowAbi } from "./abi.js";
import { addressesFromBroadcast, classifyChain, readEscrowLog } from "./sepolia.js";

const projectId = `0x${"ab".repeat(32)}` as Hex;

describe("Ethereum Sepolia reads", () => {
  it("accepts chain 11155111 only when USDC code is present", () => {
    expect(classifyChain(11155111, "0x6080")).toEqual({ rpc: "ok", usdc: "ok" });
    expect(classifyChain(11155111, "0x")).toEqual({ rpc: "ok", usdc: "missing" });
    expect(classifyChain(84532, "0x6080")).toEqual({ rpc: "wrong-network", usdc: "unchecked" });
  });

  it("reads a release log without inventing a transaction", () => {
    const encoded = encodeEventTopics({
      abi: certaEscrowAbi,
      eventName: "StageReleased",
      args: { projectId, stage: 4n },
    });
    const topics = encoded.filter((topic): topic is Hex => typeof topic === "string");
    if (topics.length !== encoded.length || topics.length === 0) throw new Error("release topics missing");
    const data = encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint256" },
      ],
      [4_500_000_000n, 225_000_000n],
    );
    const decoded = readEscrowLog(topics as [Hex, ...Hex[]], data);
    expect(decoded.eventName).toBe("StageReleased");
    if (decoded.eventName !== "StageReleased") return;
    expect(decoded.args.stage).toBe(4n);
    expect(decoded.args.payout).toBe(4_500_000_000n);
  });

  it("refuses a broadcast log that has no contracts", () => {
    expect(() => addressesFromBroadcast({ transactions: [] })).toThrow(/no escrow addresses/);
    expect(
      addressesFromBroadcast({
        transactions: [
          { contractName: "CertaEscrow", contractAddress: "0x1111111111111111111111111111111111111111" },
          { contractName: "EscrowFactory", contractAddress: "0x2222222222222222222222222222222222222222" },
        ],
      }).factory,
    ).toBe("0x2222222222222222222222222222222222222222");
  });
});
