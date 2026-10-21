import { createHash } from "node:crypto";
import type { Hex } from "viem";

const NAME_LIMIT = 36;

export type WalletPurpose =
  | "client"
  | "consultant"
  | "contractor"
  | "subcontractor"
  | "operator"
  | "agent_x402"
  | "treasury";

export function certaEnv(): string {
  return (process.env.CERTA_ENV || process.env.NODE_ENV || "dev").toLowerCase();
}

/** CDP account names allow letters, numbers, and hyphens, and stop at 36 characters. */
export function accountName(purpose: string, id?: string): string {
  const env = certaEnv().replace(/[^a-z0-9]/g, "").slice(0, 4) || "dev";
  const role = purpose.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 13) || "role";
  const hash = createHash("sha256").update(`${env}:${purpose}:${id ?? "shared"}`).digest("hex").slice(0, 8);
  return `certa-${env}-${role}-${hash}`.slice(0, NAME_LIMIT);
}

function mockAddress(name: string): Hex {
  const digest = createHash("sha256").update(`certa-mock:${name}`).digest("hex");
  return `0x${digest.slice(0, 40)}`;
}

export function cdpConfigured(): boolean {
  return Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET && process.env.CDP_WALLET_SECRET);
}

export function useLiveCdp(): boolean {
  if (!cdpConfigured()) return false;
  if (process.env.VITEST && process.env.CHAIN_LIVE !== "1") return false;
  return true;
}

type CdpAccount = { address: Hex; name?: string };

type CdpLike = {
  evm: {
    getOrCreateAccount: (args: { name: string }) => Promise<CdpAccount>;
    sendTransaction: (args: {
      address: Hex;
      network: "ethereum-sepolia";
      transaction: {
        to: Hex;
        data?: Hex;
        value?: bigint;
        nonce?: number;
        maxFeePerGas?: bigint;
        maxPriorityFeePerGas?: bigint;
      };
      idempotencyKey?: string;
    }) => Promise<{ transactionHash: Hex }>;
    signTypedData: (args: {
      address: Hex;
      domain: Record<string, unknown>;
      types: Record<string, { name: string; type: string }[]>;
      primaryType: string;
      message: Record<string, unknown>;
    }) => Promise<{ signature: Hex }>;
    updateAccount: (args: { address: Hex; update: { accountPolicy: string } }) => Promise<unknown>;
  };
  policies: {
    listPolicies: (args?: { scope?: "account" }) => Promise<{ policies?: { id: string; description?: string }[] }>;
    createPolicy: (args: { policy: Record<string, unknown>; idempotencyKey?: string }) => Promise<{ id: string }>;
    updatePolicy: (args: { id: string; policy: Record<string, unknown> }) => Promise<{ id: string }>;
  };
};

async function cdp(): Promise<CdpLike> {
  // The SDK's policy types are wider than the two calls this file makes.
  const mod = (await import(/* webpackIgnore: true */ "@coinbase/cdp-sdk")) as unknown as { CdpClient: new () => CdpLike };
  return new mod.CdpClient();
}

export async function openNamedAccount(name: string): Promise<{ address: Hex; name: string; mock: boolean }> {
  if (!useLiveCdp()) return { address: mockAddress(name), name, mock: true };
  const client = await cdp();
  const account = await client.evm.getOrCreateAccount({ name });
  return { address: account.address, name: account.name ?? name, mock: false };
}

export async function sendFromAccount(input: {
  accountName: string;
  to: Hex;
  data: Hex;
  valueWei?: bigint;
  nonce?: number;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  idempotencyKey: string;
}): Promise<Hex> {
  const { assertReleaseStageSendable } = await import("./calls.js");
  await assertReleaseStageSendable(input.to, input.data);
  const client = await cdp();
  const account = await client.evm.getOrCreateAccount({ name: input.accountName });
  const sent = await client.evm.sendTransaction({
    address: account.address,
    network: "ethereum-sepolia",
    idempotencyKey: input.idempotencyKey.slice(0, 256),
    transaction: {
      to: input.to,
      data: input.data,
      value: input.valueWei ?? 0n,
      ...(input.nonce === undefined ? {} : { nonce: input.nonce }),
      ...(input.maxFeePerGas === undefined ? {} : { maxFeePerGas: input.maxFeePerGas }),
      ...(input.maxPriorityFeePerGas === undefined ? {} : { maxPriorityFeePerGas: input.maxPriorityFeePerGas }),
    },
  });
  return sent.transactionHash;
}

export async function signTyped(input: {
  accountName: string;
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}): Promise<Hex> {
  const client = await cdp();
  const account = await client.evm.getOrCreateAccount({ name: input.accountName });
  const signed = await client.evm.signTypedData({
    address: account.address,
    domain: input.domain,
    types: input.types,
    primaryType: input.primaryType,
    message: input.message,
  });
  return signed.signature;
}

export const OPERATOR_POLICY_DESCRIPTION = "Certa operator may call the factory, project escrows, and USDC only";

/** Operator calls carry no ETH value. Network fees for role accounts come from the treasury account. */
export function operatorPolicy(allow: Hex[]): Record<string, unknown> {
  return {
    scope: "account",
    description: OPERATOR_POLICY_DESCRIPTION,
    rules: [
      {
        action: "reject",
        operation: "signEvmTransaction",
        criteria: [{ type: "ethValue", ethValue: "0", operator: ">" }],
      },
      {
        action: "reject",
        operation: "signEvmTransaction",
        criteria: [{ type: "evmAddress", addresses: allow, operator: "not in" }],
      },
    ],
  };
}

export async function ensureOperatorPolicy(operator: Hex, allow: Hex[]): Promise<{ applied: boolean; policyId?: string; note: string }> {
  if (!useLiveCdp()) return { applied: false, note: "CDP is not configured, so the operator policy was not sent." };
  try {
    const client = await cdp();
    const listed = await client.policies.listPolicies({ scope: "account" });
    const existing = listed.policies?.find((row) => row.description === OPERATOR_POLICY_DESCRIPTION);
    const policy = operatorPolicy(allow);
    const saved = existing
      ? await client.policies.updatePolicy({ id: existing.id, policy })
      : await client.policies.createPolicy({ policy, idempotencyKey: `certa-operator-policy-${certaEnv()}` });
    await client.evm.updateAccount({ address: operator, update: { accountPolicy: saved.id } });
    return { applied: true, policyId: saved.id, note: "Operator policy is attached." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = /key|secret|token|bearer|authorization/i.test(message) ? "" : message.slice(0, 180);
    return {
      applied: false,
      note: `CDP Policy Engine did not accept the operator policy. ${safe} The intended rules are in docs/spec/CDP_OPERATOR_POLICY.md.`.replace(/\s+/g, " ").trim(),
    };
  }
}
