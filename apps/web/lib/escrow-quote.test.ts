import { describe, expect, it } from "vitest";
import { chainFundLines } from "./escrow-quote.js";

describe("chain fund lines", () => {
  it("quotes work stages by on-chain index and keeps mobilisation separate", async () => {
    const lines = await chainFundLines(
      "0x0000000000000000000000000000000000000001",
      [
        { id: "m", name: "Advance", stageIndex: 0, onChainIdx: -1, kind: "mobilisation", funded: false, amountUsdc: 50n, amountNgnKobo: 50n },
        { id: "a", name: "Substructure", stageIndex: 1, onChainIdx: 0, kind: "work", funded: false, amountUsdc: 100n, amountNgnKobo: 100n },
        { id: "b", name: "Roof", stageIndex: 2, onChainIdx: 1, kind: "work", funded: false, amountUsdc: 80n, amountNgnKobo: 80n },
      ],
      1n,
      async (index) => (index === 0 ? 150n : 230n),
    );
    expect(lines?.[0]?.name).toBe("Mobilisation");
    expect(lines?.[0]?.usdc).toBe(50n);
    expect(lines?.[1]?.onChainIdx).toBe(0);
    expect(lines?.[1]?.usdc).toBe(100n);
    expect(lines?.[2]?.onChainIdx).toBe(1);
    expect(lines?.[2]?.usdc).toBe(80n);
  });
});
