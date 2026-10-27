import { certaEscrowAbi, sepoliaRpcUrl } from "@certa/chain";
import { koboFromUsdc } from "@certa/shared";
import { createPublicClient, http, type Hex } from "viem";
import { sepolia } from "viem/chains";

export type FundLine = { id?: string; name: string; usdc: bigint; kobo: bigint; onChainIdx?: number; kind?: string; funded?: boolean };

function isAddress(value: string): value is Hex {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export async function chainFundLines(
  escrow: string,
  stages: { id?: string; name: string; stageIndex: number; onChainIdx?: number; kind?: string; funded?: boolean; amountUsdc?: bigint; amountNgnKobo?: bigint }[],
  koboPerUsdc: bigint,
  quoter?: (onChainIdx: number) => Promise<bigint>,
): Promise<FundLine[] | null> {
  const ordered = [...stages].sort((a, b) => a.stageIndex - b.stageIndex);
  const work = ordered.filter((stage) => stage.kind !== "mobilisation");
  if (!quoter && !isAddress(escrow)) return null;
  if (work.length === 0 && !ordered.some((stage) => stage.kind === "mobilisation")) return null;
  const quote = quoter ?? (async (onChainIdx: number) => {
    if (!isAddress(escrow)) return 0n;
    const client = createPublicClient({ chain: sepolia, transport: http(sepoliaRpcUrl(), { timeout: 20_000 }) });
    const quotes = await client.multicall({
      contracts: [{ address: escrow, abi: certaEscrowAbi, functionName: "quoteFund" as const, args: [onChainIdx] }],
      allowFailure: false,
    });
    return quotes[0] ?? 0n;
  });
  const lines: FundLine[] = [];
  const mobilisation = ordered.find((stage) => stage.kind === "mobilisation" && (stage.amountUsdc ?? 0n) > 0n && !stage.funded);
  let previous = 0n;
  if (mobilisation) {
    previous = mobilisation.amountUsdc ?? 0n;
    lines.push({ id: mobilisation.id, name: "Mobilisation", usdc: previous, kobo: mobilisation.amountNgnKobo ?? koboFromUsdc(previous, koboPerUsdc), kind: "mobilisation", funded: false });
  }
  for (const stage of work) {
    const index = stage.onChainIdx ?? stage.stageIndex;
    const cumulative = await quote(index);
    const usdc = cumulative > previous ? cumulative - previous : (stage.amountUsdc ?? 0n);
    previous = cumulative;
    lines.push({ id: stage.id, name: stage.name, usdc, kobo: koboFromUsdc(usdc, koboPerUsdc), onChainIdx: index, kind: stage.kind, funded: stage.funded });
  }
  return lines;
}
