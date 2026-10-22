import { certaEscrowAbi, sepoliaRpcUrl, USDC_SEPOLIA } from "@certa/chain";
import { createPublicClient, createWalletClient, erc20Abi, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

export async function broadcastClientFund(escrow: Hex, upToStage: number): Promise<{ hash: Hex; amount: bigint }> {
  const key = process.env.DEPLOYER_PRIVATE_KEY ?? "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("The client key is missing.");
  const account = privateKeyToAccount(key as Hex);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(sepoliaRpcUrl(), { timeout: 30_000 }) });
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(sepoliaRpcUrl(), { timeout: 30_000 }) });
  const amount = await publicClient.readContract({
    address: escrow,
    abi: certaEscrowAbi,
    functionName: "quoteFund",
    args: [upToStage],
  });
  if (amount === 0n) throw new Error("That range has nothing left to fund.");
  const balance = await publicClient.readContract({
    address: USDC_SEPOLIA,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (balance < amount) throw new Error("The client wallet does not hold enough USDC.");
  const allowance = await publicClient.readContract({
    address: USDC_SEPOLIA,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, escrow],
  });
  const send = async (hash: Hex) => {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The fund transaction reverted.");
  };
  if (allowance < amount) {
    const approved = await wallet.writeContract({
      address: USDC_SEPOLIA,
      abi: erc20Abi,
      functionName: "approve",
      args: [escrow, amount],
      gas: 12_000_000n,
    });
    await send(approved);
  }
  const hash = await wallet.writeContract({
    address: escrow,
    abi: certaEscrowAbi,
    functionName: "fund",
    args: [amount, upToStage],
    gas: 12_000_000n,
  });
  await send(hash);
  return { hash, amount };
}
