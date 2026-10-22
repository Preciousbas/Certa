import { erc20Abi, createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { USDC_BASE_SEPOLIA } from "@certa/chain";
import { getDatabase } from "@certa/db";
import { getOrCreateWallet } from "../chain/wallets.js";
import { AGENT_USDC_FLOOR_MICRO, BASE_SEPOLIA_CHAIN } from "./gate.js";
import { x402RpcUrl } from "./agent.js";

export type X402Health = "ok" | "low" | "down" | "unconfigured";

const CDP_FACILITATOR = "https://api.cdp.coinbase.com/platform/v2/x402";
const PUBLIC_FACILITATOR = "https://x402.org/facilitator";

export function facilitatorUrl(): string {
  const configured = process.env.X402_FACILITATOR_URL?.trim();
  if (configured) return configured;
  if (process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET) return CDP_FACILITATOR;
  return PUBLIC_FACILITATOR;
}

async function supportedAt(url: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(new URL("supported", `${url.replace(/\/$/, "")}/`), { signal: AbortSignal.timeout(8_000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function facilitatorSupported(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (await supportedAt(facilitatorUrl(), fetchImpl)) return true;
  if (facilitatorUrl() === PUBLIC_FACILITATOR) return false;
  return supportedAt(PUBLIC_FACILITATOR, fetchImpl);
}

export async function agentUsdcBalance(address: `0x${string}`): Promise<bigint> {
  const client = createPublicClient({ chain: baseSepolia, transport: http(x402RpcUrl(), { timeout: 8_000 }) });
  return client.readContract({
    address: USDC_BASE_SEPOLIA,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("timed out"));
      },
    );
  });
}

export async function x402Health(): Promise<X402Health> {
  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET || !process.env.CDP_WALLET_SECRET) {
    return "unconfigured";
  }
  try {
    const db = await getDatabase();
    const wallet = await within(getOrCreateWallet(db, { purpose: "agent_x402", chainId: BASE_SEPOLIA_CHAIN }), 8_000);
    const [balance, supported] = await Promise.all([
      within(agentUsdcBalance(wallet.address), 8_000),
      facilitatorSupported(),
    ]);
    if (!supported) return "down";
    if (balance < AGENT_USDC_FLOOR_MICRO) return "low";
    return "ok";
  } catch {
    return "down";
  }
}
