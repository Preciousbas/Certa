import { livePort, type EscrowSnapshot } from "@certa/chain";

export type Hex = `0x${string}`;

export type SimResult = { ok: true } | { ok: false; name: string; plain: string };

export type ChainReceipt = {
  status: "success" | "reverted";
  blockNumber: bigint;
  confirmations: number;
  logs: { eventName: string; args: Record<string, unknown> }[];
};

export type ChainPort = {
  simulate(input: { from: Hex; to: Hex; data: Hex; valueWei?: bigint }): Promise<SimResult>;
  send(input: {
    accountName: string;
    to: Hex;
    data: Hex;
    valueWei?: bigint;
    idempotencyKey: string;
    nonce?: number;
    feeBps?: number;
  }): Promise<{ hash: Hex; nonce: bigint }>;
  receipt(hash: Hex): Promise<ChainReceipt | null>;
  ethBalance(address: Hex): Promise<bigint>;
  pendingNonce(address: Hex): Promise<number>;
  quoteFund(escrow: Hex, upTo: number): Promise<bigint>;
  escrowSnapshot(escrow: Hex): Promise<EscrowSnapshot>;
  allowance(token: Hex, owner: Hex, spender: Hex): Promise<bigint>;
  erc20Balance(token: Hex, owner: Hex): Promise<bigint>;
};

export function defaultPort(): ChainPort {
  return livePort() as ChainPort;
}
