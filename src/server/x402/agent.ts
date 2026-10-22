import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { CdpClient } from "@coinbase/cdp-sdk";
import { fromCdpEvmAccount } from "@coinbase/cdp-sdk/x402";
import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { wrapFetchWithPayment } from "@x402/fetch";
import { getDatabase } from "@certa/db";
import { isTxHash } from "@certa/chain";
import { getOrCreateWallet } from "../chain/wallets.js";
import { BASE_SEPOLIA_CHAIN, canPay, chainIdFromCaip, configuredPayTo, maxPerCallMicro, payToRefusal, plainFailure, priceForPurpose, rainThresholdPct, usdcPlain, X402_NETWORK } from "./gate.js";
import { mmLabel, parseForecast, precipMmNext24h } from "./forecast.js";
import { allowanceState, recentWeatherSpend, recordX402Payment } from "./ledger.js";

export class PaymentRefused extends Error {
  readonly plainReason: string;
  readonly permanent: boolean;

  constructor(plainReason: string, permanent = true) {
    super(plainReason);
    this.name = "PaymentRefused";
    this.plainReason = plainReason;
    this.permanent = permanent;
  }
}

export type PaidCall = {
  projectId: string;
  stageId: string;
  purpose: string;
};

export type PaidSuccess = {
  ok: true;
  amountMicro: bigint;
  usdc: string;
  txHash: `0x${string}`;
  network: string;
  proofUrl: string;
  rainExpected: boolean;
  pct: number;
  mm: string;
  summary: "Good to pour" | "Rain likely";
};

export function x402RpcUrl(): string {
  const configured = process.env.X402_RPC_URL?.trim();
  if (configured) return configured;
  return "https://sepolia.base.org";
}

export function payToAddress(): `0x${string}` | null {
  return configuredPayTo();
}

function proofUrl(hash: string): string {
  return `https://sepolia.basescan.org/tx/${hash}`;
}

async function agentSigner(): Promise<{ address: `0x${string}`; signer: ReturnType<typeof toClientEvmSigner> }> {
  const db = await getDatabase();
  const wallet = await getOrCreateWallet(db, { purpose: "agent_x402", chainId: BASE_SEPOLIA_CHAIN });
  if (wallet.mock) throw new PaymentRefused("the agent payment account is not ready");
  const cdp = new CdpClient();
  const account = await cdp.evm.getOrCreateAccount({ name: wallet.accountRef });
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(x402RpcUrl(), { timeout: 8_000 }) });
  const signer = toClientEvmSigner(fromCdpEvmAccount(account), publicClient);
  return { address: account.address, signer };
}

export async function paidFetch(url: string, input: PaidCall): Promise<PaidSuccess> {
  const price = priceForPurpose(input.purpose);
  if (price === null) throw new PaymentRefused("that check is not one Certa pays for");
  const db = await getDatabase();
  if (input.purpose === "weather_check" || input.purpose === "weather") {
    if (await recentWeatherSpend(db, input.stageId)) throw new PaymentRefused("a weather check was already paid for this stage");
  }
  const state = await allowanceState(db, input.projectId);
  if (!state) throw new PaymentRefused("this project is not open");
  const decision = canPay({ priceMicro: price, allowanceLeft: state.left, maxPerCall: maxPerCallMicro() });
  if (!decision.ok) throw new PaymentRefused(decision.reason);
  const payTo = payToAddress();
  if (!payTo) throw new PaymentRefused(payToRefusal() ?? "the payment account is not configured");

  const { address, signer } = await agentSigner();
  const client = new x402Client();
  registerExactEvmScheme(client, { signer, networks: [X402_NETWORK] });
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  let response: Response;
  try {
    response = await fetchWithPayment(url, { signal: AbortSignal.timeout(45_000) });
  } catch (error) {
    if (error instanceof PaymentRefused) throw error;
    throw new PaymentRefused(plainFailure(error), false);
  }
  if (!response.ok) {
    throw new PaymentRefused(response.status === 503 ? "the paid service is not available" : "the payment did not settle", false);
  }
  const header = response.headers.get("payment-response");
  if (!header) throw new PaymentRefused("the payment did not settle", false);
  let settled: { success?: boolean; transaction?: string; network?: string; amount?: string };
  try {
    settled = decodePaymentResponseHeader(header);
  } catch {
    throw new PaymentRefused("the payment did not settle", false);
  }
  if (!settled.success || !isTxHash(settled.transaction)) throw new PaymentRefused("the payment did not settle", false);
  const network = settled.network && chainIdFromCaip(settled.network) ? settled.network : X402_NETWORK;
  const amountMicro = settled.amount && /^\d+$/.test(settled.amount) ? BigInt(settled.amount) : price;

  const raw = await response.json().catch(() => null);
  const forecast = parseForecast(raw);
  const rainExpected = forecast ? forecast.summary.max_precip_prob_pct_next_24h >= rainThresholdPct() : false;
  const summary = forecast ? (rainExpected ? "Rain likely" : "Good to pour") : "The weather service did not answer";
  const chip = summary === "Rain likely" || summary === "Good to pour" ? summary : "The weather service did not answer";
  const recorded = await recordX402Payment(db, {
    projectId: input.projectId,
    stageId: input.stageId,
    workspaceId: state.workspaceId,
    endpoint: new URL(url).pathname,
    amountMicro,
    txHash: settled.transaction,
    network,
    fromAddress: address,
    toAddress: payTo,
    resultSummary: chip,
    paymentResponse: {
      transaction: settled.transaction,
      network,
      amount: amountMicro.toString(),
      pct: forecast?.summary.max_precip_prob_pct_next_24h ?? 0,
      mm: forecast ? mmLabel(precipMmNext24h(forecast)) : "0",
    },
  });
  if (!recorded) throw new PaymentRefused("the payment did not settle");
  if (network !== X402_NETWORK) throw new PaymentRefused("the payment was not on Base Sepolia");
  if (amountMicro > maxPerCallMicro()) throw new PaymentRefused("that check costs more than the per-call limit");
  if (!forecast) throw new PaymentRefused("the weather service did not answer", false);
  const verdict = forecast.summary.max_precip_prob_pct_next_24h >= rainThresholdPct() ? "Rain likely" : "Good to pour";
  return {
    ok: true,
    amountMicro,
    usdc: usdcPlain(amountMicro),
    txHash: recorded.txHash,
    network,
    proofUrl: proofUrl(recorded.txHash),
    rainExpected: verdict === "Rain likely",
    pct: forecast.summary.max_precip_prob_pct_next_24h,
    mm: mmLabel(precipMmNext24h(forecast)),
    summary: verdict,
  };
}
