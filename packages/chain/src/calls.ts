import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  fallback,
  http,
  keccak256,
  toBytes,
  type Abi,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import escrowAbiJson from "./CertaEscrow.abi.json" with { type: "json" };
import factoryAbiJson from "./EscrowFactory.abi.json" with { type: "json" };
import { sendFromAccount } from "./accounts.js";

export { erc20Abi } from "viem";
export type { Hex } from "viem";

export const certaEscrowFullAbi = escrowAbiJson as Abi;
export const escrowFactoryAbi = factoryAbiJson as Abi;
const logAbi = [...certaEscrowFullAbi, ...escrowFactoryAbi, ...erc20Abi] as Abi;

export const CAP_EXCEEDED_MESSAGE = "This payment is above the spending cap, so the client must tap Approve first.";

const PLAIN: Record<string, string> = {
  CapExceeded: CAP_EXCEEDED_MESSAGE,
  AmountMismatch: "The amount does not match the stages being locked.",
  TermsNotAccepted: "Both sides accept the schedule before money can be locked.",
  EvidenceRequired: "This stage needs evidence before it can be submitted.",
  NotAuthorized: "That payment account cannot do this.",
  BadStatus: "That stage is not ready for this step.",
  AlreadyApproved: "The client has already approved this stage.",
  DefectsPeriodActive: "The defects period has not finished.",
  SignatureExpired: "That signature has expired.",
  BadSignature: "That signature does not match.",
  ZeroAmount: "That range has nothing left to fund.",
  StageOutOfRange: "That stage is outside this contract.",
  NothingToRefund: "There is nothing left to refund.",
  NothingToRelease: "There is nothing left to release.",
  CancelledProject: "This project is cancelled.",
};

export type DecodedLog = { eventName: string; args: Record<string, unknown> };

function revertData(error: BaseError): Hex | null {
  const reverted = error.walk((item) => item instanceof ContractFunctionRevertedError);
  if (reverted instanceof ContractFunctionRevertedError && typeof reverted.raw === "string" && reverted.raw.startsWith("0x")) {
    return reverted.raw;
  }
  const carrier = error.walk((item) => {
    if (typeof item !== "object" || item === null || !("data" in item)) return false;
    const data = (item as { data?: unknown }).data;
    return typeof data === "string" && /^0x[0-9a-fA-F]{8}/.test(data);
  });
  if (typeof carrier === "object" && carrier !== null && "data" in carrier && typeof carrier.data === "string") return carrier.data as Hex;
  return null;
}

export function plainRevert(error: unknown): { name: string; plain: string } {
  let name = "Revert";
  if (error instanceof BaseError) {
    const reverted = error.walk((item) => item instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName) name = reverted.data.errorName;
    else {
      const data = revertData(error);
      if (data) {
        try {
          name = decodeErrorResult({ abi: logAbi, data }).errorName;
        } catch {
          name = "Revert";
        }
      }
    }
  }
  return { name, plain: PLAIN[name] ?? "The payment didn't go through." };
}

export function encodeCall(abi: Abi, functionName: string, args: readonly unknown[] = []): Hex {
  return encodeFunctionData({ abi, functionName, args });
}

export function projectBytes32(projectId: string): Hex {
  return keccak256(toBytes(projectId));
}

export function termsBytes32(contentHash: string): Hex {
  const hex = contentHash.startsWith("0x") ? contentHash.slice(2) : contentHash;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) return `0x${hex}`;
  return keccak256(toBytes(contentHash));
}

export function rpcUrls(): [string, string] {
  const primary = process.env.RPC_URL || process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const fallbackUrl = process.env.RPC_URL_FALLBACK || primary;
  return [primary, fallbackUrl];
}

function sepoliaClient() {
  const [primary, secondary] = rpcUrls();
  return createPublicClient({
    chain: sepolia,
    transport: fallback([
      http(primary, { timeout: 20_000, retryCount: 1 }),
      http(secondary, { timeout: 20_000, retryCount: 1 }),
    ]),
  });
}

export function decodeLogs(logs: { data: Hex; topics: Hex[] }[]): DecodedLog[] {
  const decoded: DecodedLog[] = [];
  for (const log of logs) {
    const topics = log.topics.filter((topic): topic is Hex => topic.startsWith("0x"));
    if (!topics[0]) continue;
    try {
      const event = decodeEventLog({ abi: logAbi, data: log.data, topics: topics as [Hex, ...Hex[]] });
      if (!event.eventName) continue;
      decoded.push({ eventName: event.eventName, args: { ...(event.args as object) } });
    } catch {
      // A log from another contract is ignored.
    }
  }
  return decoded;
}

export type EscrowSnapshot = {
  stages: { index: number; amount: bigint; status: number; clientApproved: boolean }[];
  tokenBalance: bigint;
  totalFunded: bigint;
  totalOut: bigint;
  clientAccepted: boolean;
  contractorAccepted: boolean;
};

const viewAbi = [
  { type: "function", name: "stageCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "stages",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { type: "uint256" },
      { type: "uint16" },
      { type: "uint8" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "bool" },
    ],
  },
  { type: "function", name: "quoteFund", stateMutability: "view", inputs: [{ type: "uint8" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalFunded", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalOut", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "clientAccepted", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "contractorAccepted", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "spendingCap", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export type ReleaseFacts = { amount: bigint; spendingCap: bigint; clientApproved: boolean };

export function releaseStageExceedsCap(data: Hex, facts: ReleaseFacts): boolean {
  try {
    const decoded = decodeFunctionData({ abi: certaEscrowFullAbi, data });
    if (decoded.functionName !== "releaseStage") return false;
  } catch {
    return false;
  }
  return facts.amount > facts.spendingCap && !facts.clientApproved;
}

async function readReleaseFacts(escrow: Hex, index: bigint): Promise<ReleaseFacts> {
  const client = sepoliaClient();
  const [stage, spendingCap] = await Promise.all([
    client.readContract({ address: escrow, abi: viewAbi, functionName: "stages", args: [index] }),
    client.readContract({ address: escrow, abi: viewAbi, functionName: "spendingCap" }),
  ]);
  return { amount: stage[0], spendingCap, clientApproved: stage[6] };
}

/** Runs immediately before a CDP send. An over-cap release without client approval never leaves the process. */
export async function assertReleaseStageSendable(
  to: Hex,
  data: Hex,
  read: (escrow: Hex, index: bigint) => Promise<ReleaseFacts> = readReleaseFacts,
): Promise<void> {
  let index: bigint | null = null;
  try {
    const decoded = decodeFunctionData({ abi: certaEscrowFullAbi, data });
    if (decoded.functionName !== "releaseStage") return;
    const arg = decoded.args?.[0];
    if (typeof arg === "bigint") index = arg;
  } catch {
    return;
  }
  if (index === null) return;
  const facts = await read(to, index);
  if (releaseStageExceedsCap(data, facts)) throw new Error(CAP_EXCEEDED_MESSAGE);
}

export async function readEscrowSnapshot(escrow: Hex): Promise<EscrowSnapshot> {
  const client = sepoliaClient();
  const [count, totalFunded, totalOut, clientAccepted, contractorAccepted, token] = await Promise.all([
    client.readContract({ address: escrow, abi: viewAbi, functionName: "stageCount" }),
    client.readContract({ address: escrow, abi: viewAbi, functionName: "totalFunded" }),
    client.readContract({ address: escrow, abi: viewAbi, functionName: "totalOut" }),
    client.readContract({ address: escrow, abi: viewAbi, functionName: "clientAccepted" }),
    client.readContract({ address: escrow, abi: viewAbi, functionName: "contractorAccepted" }),
    client.readContract({ address: escrow, abi: viewAbi, functionName: "token" }),
  ]);
  const total = Number(count);
  const rows = total
    ? await client.multicall({
        contracts: Array.from({ length: total }, (_, index) => ({
          address: escrow,
          abi: viewAbi,
          functionName: "stages" as const,
          args: [BigInt(index)] as const,
        })),
        allowFailure: false,
      })
    : [];
  const tokenBalance = await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [escrow] });
  return {
    stages: rows.map((row, index) => ({ index, amount: row[0], status: Number(row[2]), clientApproved: row[6] })),
    tokenBalance,
    totalFunded,
    totalOut,
    clientAccepted,
    contractorAccepted,
  };
}

export async function readQuote(escrow: Hex, upToStage: number): Promise<bigint> {
  return sepoliaClient().readContract({
    address: escrow,
    abi: viewAbi,
    functionName: "quoteFund",
    args: [upToStage],
  });
}

export async function readAllowance(token: Hex, owner: Hex, spender: Hex): Promise<bigint> {
  return sepoliaClient().readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
}

export async function readErc20Balance(token: Hex, owner: Hex): Promise<bigint> {
  return sepoliaClient().readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
}

export type ChainSend = {
  accountName: string;
  to: Hex;
  data: Hex;
  valueWei?: bigint;
  idempotencyKey: string;
  nonce?: number;
  feeBps?: number;
};

export function livePort() {
  const client = () => sepoliaClient();
  return {
    async simulate(input: { from: Hex; to: Hex; data: Hex; valueWei?: bigint }) {
      try {
        await client().call({ account: input.from, to: input.to, data: input.data, value: input.valueWei ?? 0n });
        return { ok: true as const };
      } catch (error) {
        const decoded = plainRevert(error);
        return { ok: false as const, name: decoded.name, plain: decoded.plain };
      }
    },
    async send(input: ChainSend) {
      const publicClient = client();
      const from = await addressOf(input.accountName);
      const nonce = input.nonce ?? (await publicClient.getTransactionCount({ address: from }));
      const fees = await publicClient.estimateFeesPerGas();
      const bps = BigInt(input.feeBps ?? 10_000);
      const hash = await sendFromAccount({
        accountName: input.accountName,
        to: input.to,
        data: input.data,
        valueWei: input.valueWei,
        nonce,
        maxFeePerGas: (fees.maxFeePerGas * bps) / 10_000n,
        maxPriorityFeePerGas: (fees.maxPriorityFeePerGas * bps) / 10_000n,
        idempotencyKey: input.idempotencyKey,
      });
      return { hash, nonce: BigInt(nonce) };
    },
    async receipt(hash: Hex) {
      const publicClient = client();
      const found = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
      if (!found) return null;
      const head = await publicClient.getBlockNumber();
      return {
        status: found.status,
        blockNumber: found.blockNumber,
        confirmations: Number(head - found.blockNumber) + 1,
        logs: decodeLogs(found.logs.map((log) => ({ data: log.data, topics: [...log.topics] }))),
      };
    },
    async ethBalance(address: Hex) {
      return client().getBalance({ address });
    },
    async pendingNonce(address: Hex) {
      return client().getTransactionCount({ address, blockTag: "pending" });
    },
    quoteFund: readQuote,
    escrowSnapshot: readEscrowSnapshot,
    allowance: readAllowance,
    erc20Balance: readErc20Balance,
  };
}

async function addressOf(accountName: string): Promise<Hex> {
  const { openNamedAccount } = await import("./accounts.js");
  const account = await openNamedAccount(accountName);
  return account.address;
}
