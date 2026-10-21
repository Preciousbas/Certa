import { certaEscrowAbi, sepoliaRpcUrl } from "@certa/chain";
import { koboFromUsdc } from "@certa/shared";
import { createPublicClient, http, type Hex } from "viem";
import { sepolia } from "viem/chains";

export type FundLine = { name: string; usdc: bigint; kobo: bigint };

function isAddress(value: string): value is Hex {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export async function chainFundLines(
  escrow: string,
  stages: { name: string; stageIndex: number }[],
  koboPerUsdc: bigint,
): Promise<FundLine[] | null> {
  const ordered = [...stages].sort((a, b) => a.stageIndex - b.stageIndex);
  if (!isAddress(escrow) || ordered.length === 0) return null;
  const client = createPublicClient({ chain: sepolia, transport: http(sepoliaRpcUrl(), { timeout: 20_000 }) });
  const quotes = await client.multicall({
    contracts: ordered.map((stage) => ({
      address: escrow,
      abi: certaEscrowAbi,
      functionName: "quoteFund" as const,
      args: [stage.stageIndex],
    })),
    allowFailure: false,
  });
  let previous = 0n;
  return ordered.map((stage, index) => {
    const cumulative = quotes[index] ?? 0n;
    const usdc = cumulative - previous;
    previous = cumulative;
    return { name: stage.name, usdc, kobo: koboFromUsdc(usdc, koboPerUsdc) };
  });
}
