import { createPublicClient, http, keccak256, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { sepoliaRpcUrl } from "./sepolia.js";

const releasedEvent = {
  type: "event",
  name: "StageReleased",
  inputs: [
    { name: "projectId", type: "bytes32", indexed: true },
    { name: "stage", type: "uint256", indexed: true },
    { name: "payout", type: "uint256", indexed: false },
    { name: "retentionHeld", type: "uint256", indexed: false },
  ],
} as const;

export const CHAIN_STAGE_STATUS = ["pending", "funded", "submitted", "released", "disputed", "cancelled"] as const;

const stageAbi = [
  {
    type: "function",
    name: "stages",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "retentionBps", type: "uint16" },
      { name: "status", type: "uint8" },
      { name: "releasedAmount", type: "uint256" },
      { name: "retentionHeld", type: "uint256" },
      { name: "evidenceHash", type: "bytes32" },
      { name: "clientApproved", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "stageCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "count", type: "uint256" }],
  },
] as const;

export function chainStageStatus(code: number): (typeof CHAIN_STAGE_STATUS)[number] | null {
  return CHAIN_STAGE_STATUS[code] ?? null;
}

export function photoEvidence(bytes: Uint8Array<ArrayBufferLike>): Hex {
  return keccak256(bytes);
}

export async function readEscrowStages(escrow: Hex): Promise<{ index: number; status: string; amount: bigint }[]> {
  const client = createPublicClient({ chain: sepolia, transport: http(sepoliaRpcUrl(), { timeout: 20_000 }) });
  const count = await client.readContract({ address: escrow, abi: stageAbi, functionName: "stageCount" });
  const total = Number(count);
  if (total === 0) return [];
  const rows = await client.multicall({
    contracts: Array.from({ length: total }, (_, index) => ({
      address: escrow,
      abi: stageAbi,
      functionName: "stages" as const,
      args: [BigInt(index)],
    })),
    allowFailure: false,
  });
  return rows.flatMap((row, index) => {
    const status = chainStageStatus(Number(row[2]));
    return status ? [{ index, status, amount: row[0] }] : [];
  });
}

export async function readReleaseLogs(escrow: Hex): Promise<{ index: number; txHash: Hex; payout: bigint }[]> {
  const client = createPublicClient({ chain: sepolia, transport: http(sepoliaRpcUrl(), { timeout: 20_000 }) });
  const latest = await client.getBlockNumber();
  const fromBlock = latest > 80_000n ? latest - 80_000n : 0n;
  const logs = await client.getLogs({ address: escrow, event: releasedEvent, fromBlock, toBlock: latest });
  return logs.flatMap((log) => {
    const index = log.args.stage;
    const payout = log.args.payout;
    if (index === undefined || payout === undefined) return [];
    return [{ index: Number(index), txHash: log.transactionHash, payout }];
  });
}
