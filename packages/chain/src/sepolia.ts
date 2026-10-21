import { createPublicClient, decodeEventLog, erc20Abi, http, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { SEPOLIA_CHAIN_ID, USDC_SEPOLIA, certaEscrowAbi } from "./abi.js";

export function classifyChain(chainId: number, usdcCode: string | undefined): { rpc: "ok" | "wrong-network"; usdc: "ok" | "missing" | "unchecked" } {
  if (chainId !== SEPOLIA_CHAIN_ID) return { rpc: "wrong-network", usdc: "unchecked" };
  return { rpc: "ok", usdc: usdcCode && usdcCode !== "0x" ? "ok" : "missing" };
}

export function sepoliaRpcUrl(): string {
  return process.env.SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
}

function sepoliaClient(rpcUrl = sepoliaRpcUrl()) {
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl, { timeout: 8_000 }) });
}

export async function probeBaseSepolia(rpcUrl?: string) {
  const client = sepoliaClient(rpcUrl);
  const [chainId, code] = await Promise.all([
    client.getChainId(),
    client.getCode({ address: USDC_SEPOLIA }),
  ]);
  return classifyChain(chainId, code ?? undefined);
}

export async function readUsdcBalance(holder: Hex, rpcUrl?: string): Promise<bigint> {
  const client = sepoliaClient(rpcUrl);
  return client.readContract({
    address: USDC_SEPOLIA,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [holder],
  });
}

export function sepoliaTx(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

export function sepoliaAddress(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}

export const basescanTx = sepoliaTx;
export const basescanAddress = sepoliaAddress;

export function isTxHash(value: string | null | undefined): value is Hex {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

type BroadcastTx = { contractName?: string; contractAddress?: string | null };

export function addressesFromBroadcast(run: { transactions?: BroadcastTx[] }) {
  const rows = run.transactions ?? [];
  const implementation = rows.find((row) => row.contractName === "CertaEscrow")?.contractAddress ?? "";
  const factory = rows.find((row) => row.contractName === "EscrowFactory")?.contractAddress ?? "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(implementation) || !/^0x[a-fA-F0-9]{40}$/.test(factory)) {
    throw new Error("Broadcast log has no escrow addresses.");
  }
  return {
    chainId: SEPOLIA_CHAIN_ID,
    usdc: USDC_SEPOLIA,
    implementation,
    factory,
  };
}

export function readEscrowLog(topics: [Hex, ...Hex[]], data: Hex) {
  return decodeEventLog({ abi: certaEscrowAbi, topics, data });
}
