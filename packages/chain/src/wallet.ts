import { createHash } from "node:crypto";
import { encodeFunctionData, keccak256, toBytes, type Hex } from "viem";
import { certaEscrowAbi } from "./abi.js";

export type PartyWallet = { address: Hex; walletId: string; mock: boolean };

export function mockAddress(seed: string): Hex {
  const digest = createHash("sha256").update(seed).digest("hex");
  return `0x${digest.slice(0, 40)}`;
}

export async function createPartyWallet(partyId: string): Promise<PartyWallet> {
  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET || !process.env.CDP_WALLET_SECRET) {
    return { address: mockAddress(partyId), walletId: `mock:${partyId}`, mock: true };
  }
  const mod = (await import(/* webpackIgnore: true */ "@coinbase/cdp-sdk")) as {
    CdpClient: new (args?: object) => {
      evm: { createAccount: (args: { name: string }) => Promise<{ address: Hex; name?: string }> };
    };
  };
  const cdp = new mod.CdpClient();
  const account = await cdp.evm.createAccount({ name: `certa-${partyId}`.slice(0, 36) });
  return { address: account.address, walletId: account.name ?? account.address, mock: false };
}

export function evidenceHash(payload: string): Hex {
  return keccak256(toBytes(payload));
}

export function encodeRelease(stageIndex: number): Hex {
  return encodeFunctionData({ abi: certaEscrowAbi, functionName: "releaseStage", args: [BigInt(stageIndex)] });
}
