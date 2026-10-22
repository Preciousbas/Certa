import { photoEvidence, readEscrowStages, sepoliaRpcUrl, certaEscrowAbi } from "@certa/chain";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

export async function broadcastStageRelease(escrow: Hex, stageIndex: number, image: Uint8Array<ArrayBufferLike>): Promise<Hex | null> {
  const key = process.env.DEPLOYER_PRIVATE_KEY ?? "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  const rows = await readEscrowStages(escrow);
  const status = rows.find((row) => row.index === stageIndex)?.status;
  if (status !== "funded" && status !== "submitted") return null;
  const account = privateKeyToAccount(key as Hex);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(sepoliaRpcUrl(), { timeout: 30_000 }) });
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(sepoliaRpcUrl(), { timeout: 30_000 }) });
  const send = async (hash: Hex) => {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The release transaction reverted.");
  };
  if (status === "funded") {
    const submitted = await wallet.writeContract({
      address: escrow,
      abi: certaEscrowAbi,
      functionName: "submitStage",
      args: [BigInt(stageIndex), photoEvidence(image)],
      gas: 12_000_000n,
    });
    await send(submitted);
  }
  const released = await wallet.writeContract({
    address: escrow,
    abi: certaEscrowAbi,
    functionName: "releaseStage",
    args: [BigInt(stageIndex)],
    gas: 12_000_000n,
  });
  await send(released);
  return released;
}
